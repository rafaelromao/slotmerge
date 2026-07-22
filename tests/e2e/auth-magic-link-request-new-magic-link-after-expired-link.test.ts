import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { eq } from "drizzle-orm";
import { getTestDb, setupTest } from "../helpers/setup";
import { invites, users } from "../../src/db/schema";
import { createMagicLinkRequestHandlers } from "../../src/auth/magic-link-request";
import { createMagicLinkVerifyHandlers } from "../../src/auth/magic-link-verify";
import { createMagicLinkResendHandlers } from "../../src/auth/magic-link-resend";
import type { EmailDeliveryService, EmailType } from "../../src/email/service";
import { buildTestClock } from "../test-clock";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const MAGIC_LINK_SECRET = "test-magic-link-secret-e2e-73";
const INVITEE_EMAIL = "resend-invitee@example.com";
const INVITE_ROLE = "user";

type RecordedSend = {
  recipient: string;
  type: EmailType;
  payload: Record<string, unknown>;
};

type RecordingEmailService = EmailDeliveryService & {
  sends: RecordedSend[];
};

function createRecordingEmailService(): RecordingEmailService {
  const sends: RecordedSend[] = [];
  return {
    sends,
    sendEmail: async (input) => {
      sends.push({
        recipient: input.recipient,
        type: input.type,
        payload: input.payload,
      });
      await Promise.resolve();
      const now = new Date();
      return {
        emailEvent: {
          id: `evt-${input.recipient}-${sends.length}`,
          recipient: input.recipient,
          type: input.type,
          payloadReference: "ref-e2e-73",
          status: "sent",
          attempts: 0,
          createdAt: now,
          updatedAt: now,
          sentAt: now,
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      };
    },
  };
}

async function insertPendingInvite(email: string): Promise<string> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const escaped = email.replace(/'/g, "''");
  const result = await db.execute<{ id: string }>(
    `INSERT INTO invites (id, email, role, status, expires_at, created_at, updated_at)
     VALUES (gen_random_uuid(), '${escaped}', '${INVITE_ROLE}', 'pending', NOW() + INTERVAL '7 days', NOW(), NOW())
     RETURNING id`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("invite insert returned no row");
  }
  return row.id;
}

async function countSessions(): Promise<number> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ count: string }>(
    "SELECT COUNT(*) as count FROM sessions",
  );
  return Number(result.rows[0].count);
}

function extractMagicLinkToken(payload: Record<string, unknown>): string {
  const magicLinkToken = payload.magicLinkToken;
  if (typeof magicLinkToken !== "string" || !magicLinkToken) {
    throw new Error(
      `recorded magic-link payload did not include a string magicLinkToken: ${JSON.stringify(payload)}`,
    );
  }
  return magicLinkToken;
}

function extractResendTokenFromHtml(html: string): string {
  const match = html.match(/name="token" value="([^"]+)"/);
  if (!match) {
    throw new Error(
      `expired-link response did not include a hidden token input for resend: ${html}`,
    );
  }
  return match[1];
}

describe("E2E: request a new magic link after an expired link", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = MAGIC_LINK_SECRET;
    process.env.SESSION_SECRET = "test-session-secret-73-characters-long";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "after the expired-link error page offers 'Send a new link', the prior token no longer authenticates and a freshly issued token signs the invitee in",
    async () => {
      await setupTest();
      await insertPendingInvite(INVITEE_EMAIL);

      const clock = buildTestClock(new Date("2026-07-12T12:00:00.000Z"));
      const sessionsBefore = await countSessions();

      const emailService = createRecordingEmailService();
      const { POST: postRequest } = createMagicLinkRequestHandlers({
        clock,
        magicLinkSecret: MAGIC_LINK_SECRET,
        emailDeliveryService: emailService,
      });

      const requestResponse = await postRequest(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          headers: { "x-forwarded-for": "10.0.0.73" },
          body: new URLSearchParams({ email: INVITEE_EMAIL }),
        }),
      );

      expect(requestResponse.status).toBe(202);
      expect(emailService.sends).toHaveLength(1);
      const originalToken = extractMagicLinkToken(
        emailService.sends[0].payload,
      );

      clock.advance(60 * 60 * 1000 + 1);

      const { POST: postVerify } = createMagicLinkVerifyHandlers({
        clock,
        magicLinkSecret: MAGIC_LINK_SECRET,
      });

      const verifyExpiredResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: originalToken }).toString(),
        }),
      );

      expect(verifyExpiredResponse.status).toBe(400);
      expect(verifyExpiredResponse.headers.get("Set-Cookie")).toBeNull();
      const expiredHtml = await verifyExpiredResponse.text();
      expect(expiredHtml).toContain("token_expired");
      expect(expiredHtml).toContain("link_expired");
      expect(expiredHtml).toContain("Send a new link");
      expect(expiredHtml).toContain('action="/auth/magic-link/resend"');
      expect(expiredHtml).toContain("Request a new link");
      expect(expiredHtml).toContain(
        `href="/sign-in?email=${encodeURIComponent(INVITEE_EMAIL)}"`,
      );

      expect(await countSessions()).toBe(sessionsBefore);

      const resendToken = extractResendTokenFromHtml(expiredHtml);
      expect(resendToken).toBe(originalToken);

      const { POST: postResend } = createMagicLinkResendHandlers({
        clock,
        magicLinkSecret: MAGIC_LINK_SECRET,
        emailDeliveryService: emailService,
      });

      const resendResponse = await postResend(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: resendToken }).toString(),
        }),
      );

      expect(resendResponse.status).toBe(200);
      const resendHtml = await resendResponse.text();
      expect(resendHtml).toContain("Check your email");
      expect(resendHtml).not.toContain(INVITEE_EMAIL);

      expect(emailService.sends).toHaveLength(2);
      const resentToken = extractMagicLinkToken(emailService.sends[1].payload);
      expect(resentToken).not.toBe(originalToken);

      const verifyPriorResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: originalToken }).toString(),
        }),
      );

      expect(verifyPriorResponse.status).toBe(400);
      expect(verifyPriorResponse.headers.get("Set-Cookie")).toBeNull();

      expect(await countSessions()).toBe(sessionsBefore);

      const verifyFreshResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: resentToken }).toString(),
        }),
      );

      expect(verifyFreshResponse.status).toBe(303);
      const setCookie = verifyFreshResponse.headers.get("Set-Cookie");
      expect(setCookie).not.toBeNull();
      expect(setCookie ?? "").toContain("slotmerge_session=");

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const sessionCount = await countSessions();
      expect(sessionCount).toBe(sessionsBefore + 1);

      const [createdUser] = await db
        .select({ email: users.email, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.email, INVITEE_EMAIL))
        .limit(1);
      expect(createdUser).not.toBeNull();
      expect(createdUser?.email).toBe(INVITEE_EMAIL);
      expect(createdUser?.role).toBe(INVITE_ROLE);
      expect(createdUser?.status).toBe("active");

      const [acceptedInvite] = await db
        .select({ status: invites.status, role: invites.role })
        .from(invites)
        .where(eq(invites.email, INVITEE_EMAIL))
        .limit(1);
      expect(acceptedInvite?.status).toBe("accepted");
      expect(acceptedInvite?.role).toBe(INVITE_ROLE);
    },
  );
});
