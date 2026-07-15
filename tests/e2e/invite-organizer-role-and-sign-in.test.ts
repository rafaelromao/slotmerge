import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { POST as postVerify } from "../../app/auth/magic-link/verify/route";
import { createAdminInvitesHandlers } from "../../src/admin/invites";
import { isOrganizerOrAdminSession, sealSessionCookie } from "../../src/auth/session";
import { invites, sessions, users } from "../../src/db/schema";
import type {
  EmailDeliveryService,
  EmailType,
} from "../../src/email/service";
import {
  createMatchingDependencies,
  findEligibleMatches,
} from "../../src/matching";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
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

  it.runIf(HAS_TEST_DB)(
    "Admin submits an Organizer invite; the form exposes the explicit role select; recipient signs in and has Organizer permissions in a subsequent search",
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
      expect(inviteResponse.headers.get("location")).toBe(
        "http://localhost/admin/invites",
      );

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
      expect(setCookie ?? "").toContain("slotmerge_session=");
      const newlyIssuedCookie = setCookie ?? "";

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

      const newOrganizerId = newUser?.id ?? "";

      expect(
        isOrganizerOrAdminSession({
          user: {
            id: newOrganizerId,
            email: inviteeEmail,
            displayName: null,
            avatarUrl: null,
            shortBio: null,
            role: "organizer",
            status: "active",
            profileTimezone: null,
            bufferMinutes: 0,
          },
          csrfToken: "irrelevant",
        }),
      ).toBe(true);

      const candidateId = USER_FIXTURES[0].id;
      await grantDiscoverabilityConsent(candidateId);
      setSearchEligibilityProfileInputsForTests({
        [candidateId]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const matches = await findEligibleMatches(
        {
          organizerId: newOrganizerId,
          selectedTopicIds: [TOPIC_FIXTURES[0].id],
          candidateUserIds: [candidateId],
          durationMinutes: 60,
          rangeStart: new Date("2026-07-13T00:00:00.000Z"),
          rangeEnd: new Date("2026-07-14T00:00:00.000Z"),
        },
        createMatchingDependencies(),
      );

      expect(matches).toContain(candidateId);

      const [persistedUsers] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, newOrganizerId))
        .limit(1);
      expect(persistedUsers?.role).toBe("organizer");

      setSearchEligibilityProfileInputsForTests(null);

      expect(newlyIssuedCookie.length).toBeGreaterThan(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "the Admin invite form renders an explicit role select with an Organizer option",
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
