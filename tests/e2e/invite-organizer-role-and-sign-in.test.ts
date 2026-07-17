import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { createAdminInvitesHandlers } from "../../src/admin/invites";
import { createMagicLinkVerifyHandlers } from "../../src/auth/magic-link-verify";
import { getSessionFromRequest, sealSessionCookie } from "../../src/auth/session";
import { invites, sessions } from "../../src/db/schema";
import type {
  EmailDeliveryService,
  EmailType,
} from "../../src/email/service";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { getProfileByUserId } from "../../src/profile/repository";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import {
  createDefaultSearchSnapshotAssemblerDeps,
  SearchSnapshotAssembler,
} from "../../src/search/search-snapshot-assembler";
import { TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
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

function extractMagicLinkToken(payload: Record<string, unknown>): string {
  const magicLinkToken = payload.magicLinkToken;
  if (typeof magicLinkToken !== "string" || !magicLinkToken) {
    throw new Error(
      `recorded invite payload did not include a string magicLinkToken: ${JSON.stringify(payload)}`,
    );
  }
  return magicLinkToken;
}

describe("E2E: invite role selection is explicit for Organizer and Admin", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = "test-magic-link-secret-70";
    process.env.SESSION_SECRET = "test-session-secret-70-characters-long";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
  });

  it.runIf(HAS_TEST_DB)(
    "Admin submits an Organizer invite and the recipient signs in with Organizer permissions for a subsequent search",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = getTestClock()();

      const adminUser = USER_FIXTURES[2];
      const adminSessionId = "00000000-0000-0000-0000-00000000a070";
      const adminCsrfToken = "admin-csrf-70";
      await insertAdminSession({
        db,
        sessionId: adminSessionId,
        userId: adminUser.id,
        csrfToken: adminCsrfToken,
        now,
      });

      const emailService = createRecordingEmailService();
      const { POST: postInvite } = createAdminInvitesHandlers({
        emailDeliveryService: emailService,
      });
      const { POST: postVerify } = createMagicLinkVerifyHandlers({
        magicLinkSecret: process.env.MAGIC_LINK_SECRET,
      });

      const inviteeEmail = "new-organizer@example.com";

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
            role: "organizer",
          }).toString(),
        }),
      );

      expect(inviteResponse.status).toBe(303);

      const inviteRow = await readInviteByEmail(db, inviteeEmail);
      expect(inviteRow).not.toBeNull();
      expect(inviteRow?.role).toBe("organizer");
      expect(inviteRow?.status).toBe("pending");
      expect(inviteRow?.invited_by_admin_id).toBe(adminUser.id);

      expect(emailService.sends).toHaveLength(1);
      const sent = emailService.sends[0];
      expect(sent.recipient).toBe(inviteeEmail);
      expect(sent.type).toBe("invite");
      expect(sent.payload.role).toBe("organizer");

      const magicLinkToken = extractMagicLinkToken(sent.payload);

      const verifyResponse = await postVerify(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: magicLinkToken }).toString(),
        }),
      );

      expect(verifyResponse.status).toBe(302);
      const setCookie = verifyResponse.headers.get("Set-Cookie");
      expect(setCookie).not.toBeNull();
      const cookieValue = setCookie ?? "";
      expect(cookieValue).toContain("slotmerge_session=");

      const newUser = await readUserByEmail(db, inviteeEmail);
      expect(newUser).not.toBeNull();
      expect(newUser?.email).toBe(inviteeEmail);
      expect(newUser?.role).toBe("organizer");
      expect(newUser?.status).toBe("active");

      const [acceptedInvite] = await db
        .select({ status: invites.status, role: invites.role })
        .from(invites)
        .where(eq(invites.email, inviteeEmail))
        .limit(1);
      expect(acceptedInvite?.status).toBe("accepted");
      expect(acceptedInvite?.role).toBe("organizer");

      const resolvedSession = await getSessionFromRequest(
        new Request("http://localhost/", {
          headers: { cookie: cookieValue },
        }),
      );
      expect(resolvedSession).not.toBeNull();
      expect(resolvedSession?.user.email).toBe(inviteeEmail);
      expect(resolvedSession?.user.role).toBe("organizer");
      expect(resolvedSession?.user.status).toBe("active");

      const newOrganizerId = newUser?.id ?? "";
      expect(newOrganizerId).toBe(resolvedSession?.user.id ?? "");

      const candidateId = USER_FIXTURES[0].id;
      await grantDiscoverabilityConsent(candidateId);
      const matches = await runMatchingViaAssembler(newOrganizerId, candidateId);

      expect(matches).toContain(candidateId);
    },
  );

async function runMatchingViaAssembler(
  organizerId: string,
  candidateId: string,
): Promise<string[]> {
  const assembler = new SearchSnapshotAssembler(
    createDefaultSearchSnapshotAssemblerDeps({
      clock: { now: getTestClock() },
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      topicRepository: {
        listActive() {
          return Promise.resolve(
            TOPIC_FIXTURES.filter((t) => t.status === "active").map((t) => ({
              id: t.id,
              name: t.name,
              status: "active" as const,
            })),
          );
        },
      },
      profileRepository: {
        findByUserId(uid) {
          return getProfileByUserId(uid);
        },
      },
    }),
  );
  const snapshot = await assembler.assemble({
    organizerId,
    selectedTopicIds: [TOPIC_FIXTURES[0].id],
    durationMinutes: 60,
    dateRangeStart: new Date("2026-07-13T00:00:00.000Z"),
    dateRangeEnd: new Date("2026-07-14T00:00:00.000Z"),
    organizerTimezone: "UTC",
    minimumMatchingUsers: 1,
  });
  const matched = new Set<string>();
  for (const slot of snapshot.slots) {
    for (const match of slot.matches) {
      if (match.userId === candidateId) {
        matched.add(match.userId);
      }
    }
  }
  return Array.from(matched);
}

  it.runIf(HAS_TEST_DB)(
    "the Admin invite form renders an explicit role select with an Organizer option and an Admin option",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = getTestClock()();
      const adminUser = USER_FIXTURES[2];
      const adminSessionId = "00000000-0000-0000-0000-00000000a072";
      const adminCsrfToken = "admin-csrf-72";
      await insertAdminSession({
        db,
        sessionId: adminSessionId,
        userId: adminUser.id,
        csrfToken: adminCsrfToken,
        now,
      });

      const { GET } = createAdminInvitesHandlers({
        emailDeliveryService: createRecordingEmailService(),
      });

      const response = await GET(
        new Request("http://localhost/admin/invites", {
          headers: {
            cookie: await sealSessionCookie({ sessionId: adminSessionId }),
          },
        }),
      );

      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('name="role"');
      expect(html).toContain('<option value="organizer">Organizer</option>');
      expect(html).toContain('<option value="user"');
      expect(html).toContain('<option value="admin">Admin</option>');
    },
  );
});
