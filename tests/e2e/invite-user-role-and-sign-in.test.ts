import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createAdminInvitesHandlers } from "../../src/admin/invites";
import { systemClock } from "../../src/system/clock";
import { createMagicLinkVerifyHandlers } from "../../src/auth/magic-link-verify";
import {
  getSessionFromRequest,
  sealSessionCookie,
} from "../../src/auth/session";
import { invites, sessions } from "../../src/db/schema";
import type { EmailDeliveryService, EmailType } from "../../src/email/service";
import { USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

type RecordedInviteSend = {
  recipient: string;
  type: EmailType;
  payload: Record<string, unknown>;
};

type RecordingEmailService = EmailDeliveryService & {
  sends: RecordedInviteSend[];
};

function createRecordingEmailService(): RecordingEmailService {
  const sends: RecordedInviteSend[] = [];
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
          payloadReference: "ref-recording",
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

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_by_admin_id: string;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
};

type SessionCountRow = { count: string };

async function insertAdminSession({
  db,
  sessionId,
  userId,
  csrfToken,
  now,
}: {
  db: NonNullable<ReturnType<typeof getTestDb>>;
  sessionId: string;
  userId: string;
  csrfToken: string;
  now: Date;
}): Promise<void> {
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    csrfToken,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: now,
  });
}

async function readInviteByEmail(
  db: NonNullable<ReturnType<typeof getTestDb>>,
  email: string,
): Promise<InviteRow | null> {
  const result = await db.execute<InviteRow>(
    `SELECT id, email, role, status, invited_by_admin_id FROM invites WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function readUserByEmail(
  db: NonNullable<ReturnType<typeof getTestDb>>,
  email: string,
): Promise<UserRow | null> {
  const result = await db.execute<UserRow>(
    `SELECT id, email, role, status FROM users WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function countSessionsForUser(
  db: NonNullable<ReturnType<typeof getTestDb>>,
  userId: string,
): Promise<number> {
  const result = await db.execute<SessionCountRow>(
    `SELECT COUNT(*) as count FROM sessions WHERE user_id = '${userId.replace(/'/g, "''")}'`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

function extractMagicLinkToken(payload: Record<string, unknown>): string {
  const magicLinkToken = payload.magicLinkToken;
  if (typeof magicLinkToken !== "string" || !magicLinkToken) {
    throw new Error(
      `recorded invite payload did not include a string magicLinkToken: ${JSON.stringify(payload)}`,
    );
  }
  return magicLinkToken;
}

function extractMagicLinkUrl(payload: Record<string, unknown>): string {
  const magicLinkUrl = payload.magicLinkUrl;
  if (typeof magicLinkUrl !== "string" || !magicLinkUrl) {
    throw new Error(
      `recorded invite payload did not include a string magicLinkUrl: ${JSON.stringify(payload)}`,
    );
  }
  return magicLinkUrl;
}

describe("E2E: invite role selection is explicit for User", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = "test-magic-link-secret-80";
    process.env.SESSION_SECRET = "test-session-secret-80-characters-long";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "Admin submits a User invite, the recipient accepts the magic link, and the link is single-use on a second click",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = getTestClock()();

      const adminUser = USER_FIXTURES[2];
      const adminSessionId = "00000000-0000-0000-0000-00000000a080";
      const adminCsrfToken = "admin-csrf-80";
      await insertAdminSession({
        db,
        sessionId: adminSessionId,
        userId: adminUser.id,
        csrfToken: adminCsrfToken,
        now,
      });

      const emailService = createRecordingEmailService();
      const { POST: postInvite } = createAdminInvitesHandlers({
        clock: systemClock(),
        emailDeliveryService: emailService,
      });
      const { POST: postVerify } = createMagicLinkVerifyHandlers({
        magicLinkSecret: process.env.MAGIC_LINK_SECRET,
      });

      const inviteeEmail = "new-user@example.com";

      const inviteResponse = await postInvite(
        new Request("http://localhost/admin/invites", {
          method: "POST",
          headers: {
            cookie: await sealSessionCookie({ sessionId: adminSessionId }),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            _csrf: adminCsrfToken,
            email: inviteeEmail,
            role: "user",
          }).toString(),
        }),
      );

      expect(inviteResponse.status).toBe(303);

      const inviteRow = await readInviteByEmail(db, inviteeEmail);
      expect(inviteRow).not.toBeNull();
      expect(inviteRow?.role).toBe("user");
      expect(inviteRow?.status).toBe("pending");
      expect(inviteRow?.invited_by_admin_id).toBe(adminUser.id);

      expect(emailService.sends).toHaveLength(1);
      const sent = emailService.sends[0];
      expect(sent.recipient).toBe(inviteeEmail);
      expect(sent.type).toBe("invite");
      expect(sent.payload.role).toBe("user");
      expect(sent.payload.email).toBe(inviteeEmail);

      const magicLinkUrl = extractMagicLinkUrl(sent.payload);
      const magicLinkToken = extractMagicLinkToken(sent.payload);
      expect(magicLinkUrl).toContain(`token=${magicLinkToken}`);

      const verifyResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: magicLinkToken }).toString(),
        }),
      );

      expect(verifyResponse.status).toBe(302);
      expect(verifyResponse.headers.get("Location")).toBe("http://localhost/");
      const setCookie = verifyResponse.headers.get("Set-Cookie");
      expect(setCookie).not.toBeNull();
      const cookieValue = setCookie ?? "";
      expect(cookieValue).toContain("slotmerge_session=");

      const newUser = await readUserByEmail(db, inviteeEmail);
      expect(newUser).not.toBeNull();
      expect(newUser?.email).toBe(inviteeEmail);
      expect(newUser?.role).toBe("user");
      expect(newUser?.status).toBe("active");

      const [acceptedInvite] = await db
        .select({ status: invites.status, role: invites.role })
        .from(invites)
        .where(eq(invites.email, inviteeEmail))
        .limit(1);
      expect(acceptedInvite?.status).toBe("accepted");
      expect(acceptedInvite?.role).toBe("user");

      const resolvedSession = await getSessionFromRequest(
        new Request("http://localhost/", {
          headers: { cookie: cookieValue },
        }),
      );
      expect(resolvedSession).not.toBeNull();
      expect(resolvedSession?.user.email).toBe(inviteeEmail);
      expect(resolvedSession?.user.role).toBe("user");
      expect(resolvedSession?.user.status).toBe("active");

      const newUserId = newUser?.id ?? "";
      expect(newUserId).toBe(resolvedSession?.user.id ?? "");
      const sessionCountAfterFirstAccept = await countSessionsForUser(
        db,
        newUserId,
      );
      expect(sessionCountAfterFirstAccept).toBe(1);

      const replayResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: magicLinkToken }).toString(),
        }),
      );

      expect(replayResponse.status).toBe(400);
      const replayHtml = await replayResponse.text();
      expect(replayHtml).toContain("invite_already_accepted");

      const replaySetCookie = replayResponse.headers.get("Set-Cookie");
      const containsSessionCookie =
        typeof replaySetCookie === "string" &&
        replaySetCookie.includes("slotmerge_session=");
      expect(containsSessionCookie).toBe(false);

      const sessionCountAfterReplay = await countSessionsForUser(db, newUserId);
      expect(sessionCountAfterReplay).toBe(1);
    },
  );
});
