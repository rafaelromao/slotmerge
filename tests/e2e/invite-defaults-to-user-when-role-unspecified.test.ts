import {
  afterAll,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { createAdminInvitesHandlers } from "../../src/admin/invites";
import { systemClock } from "../../src/system/clock";
import { sealSessionCookie } from "../../src/auth/session";
import { sessions } from "../../src/db/schema";
import type {
  EmailDeliveryService,
  EmailType,
} from "../../src/email/service";
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

describe("E2E: invites default to User when role is unspecified", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = "test-magic-link-secret-69";
    process.env.SESSION_SECRET = "test-session-secret-69-characters-long";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "Admin submits an invite form with the role field omitted and the persisted invite defaults to role User",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = getTestClock()();

      const adminUser = USER_FIXTURES[2];
      const adminSessionId = "00000000-0000-0000-0000-00000000a069";
      const adminCsrfToken = "admin-csrf-69";
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

      const inviteeEmail = "default-role@example.com";

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
    },
  );
});
