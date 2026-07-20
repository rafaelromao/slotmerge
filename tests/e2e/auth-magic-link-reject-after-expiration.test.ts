import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { getTestDb, setupTest } from "../helpers/setup";
import { createMagicLinkRequestHandlers } from "../../src/auth/magic-link-request";
import { createMagicLinkVerifyHandlers } from "../../src/auth/magic-link-verify";
import { verifyMagicLinkToken } from "../../src/auth/magic-link";
import type { EmailDeliveryService, EmailType } from "../../src/email/service";
import { buildTestClock } from "../test-clock";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const MAGIC_LINK_SECRET = "test-magic-link-secret-e2e-71";
const INVITEE_EMAIL = "expiring-invitee@example.com";
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
          id: `evt-${input.recipient}`,
          recipient: input.recipient,
          type: input.type,
          payloadReference: "ref-e2e-71",
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

describe("E2E: magic link is rejected after expiration", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = MAGIC_LINK_SECRET;
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "clicking a magic link after the clock has advanced past its expiration returns a clear token_expired error and creates no session",
    async () => {
      await setupTest();
      await insertPendingInvite(INVITEE_EMAIL);

      const clock = buildTestClock(new Date("2026-07-12T12:00:00.000Z"));
      const sessionsBefore = await countSessions();

      const emailService = createRecordingEmailService();
      const { POST: postRequest } = createMagicLinkRequestHandlers({
        clock: clock,
        magicLinkSecret: MAGIC_LINK_SECRET,
        emailDeliveryService: emailService,
      });

      const requestResponse = await postRequest(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          headers: { "x-forwarded-for": "10.0.0.71" },
          body: new URLSearchParams({ email: INVITEE_EMAIL }),
        }),
      );

      expect(requestResponse.status).toBe(200);
      expect(emailService.sends).toHaveLength(1);
      const sent = emailService.sends[0];
      const magicLinkToken = extractMagicLinkToken(sent.payload);

      expect(() =>
        verifyMagicLinkToken(magicLinkToken, MAGIC_LINK_SECRET, clock),
      ).not.toThrow();

      clock.advance(60 * 60 * 1000 + 1);

      const { POST: postVerify } = createMagicLinkVerifyHandlers({
        clock: clock,
        magicLinkSecret: MAGIC_LINK_SECRET,
      });

      const verifyResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: magicLinkToken }).toString(),
        }),
      );

      expect(verifyResponse.status).toBe(400);
      expect(verifyResponse.headers.get("Set-Cookie")).toBeNull();
      const html = await verifyResponse.text();
      expect(html).toContain("token_expired");
      expect(html).toContain("Send a new link");
      expect(html).toContain('action="/auth/magic-link/resend"');

      expect(await countSessions()).toBe(sessionsBefore);
    },
  );
});
