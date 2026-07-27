import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { DELETE } from "../../app/api/v1/me/route";
import { createAdminTopicProposalsHandlers } from "../../src/admin/topic-proposals";
import { sealSessionCookie } from "../../src/auth/session";
import {
  availabilityOverrides,
  availabilityWindows,
  calendarConnections,
  discoverabilityConsents,
  emailEventAttempts,
  emailEvents,
  importedBusyIntervals,
  sessions,
  topicProposals,
  topics,
  userTopics,
  users,
} from "../../src/db/schema";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";
import { createConnectionActionRequiredDedupReference } from "../../src/calendar/action-required-email";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const USER_ID = "00000000-0000-0000-0000-00000000c078";
const USER_EMAIL = "self-delete-audit-user@example.com";
const ADMIN_ID = "00000000-0000-0000-0000-00000000a078";
const SESSION_ID = "00000000-0000-0000-0000-00000000b078";
const CSRF_TOKEN = "csrf-self-delete-audit-78";
const PROPOSAL_ID = "00000000-0000-0000-0000-00000000d078";
const GOOGLE_CONNECTION_ID = "00000000-0000-0000-0000-00000000e078";
const MICROSOFT_CONNECTION_ID = "00000000-0000-0000-0000-00000000e179";
const PERSONAL_EMAIL_EVENT_ID = "00000000-0000-0000-0000-00000000e278";
const CONNECTION_EMAIL_EVENT_ID = "00000000-0000-0000-0000-00000000e378";
const UNRELATED_EMAIL_EVENT_ID = "00000000-0000-0000-0000-00000000e478";
const PREFIX_EMAIL_EVENT_ID = "00000000-0000-0000-0000-00000000e678";
const PROPOSAL_NAME = "Knowledge graphs";

type CountResult = { count: string };

async function countRows(table: string, whereClause: string): Promise<number> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<CountResult>(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function selectProposal(proposalId: string): Promise<{
  id: string;
  candidateName: string;
  status: string;
  proposedByUserId: string | null;
} | null> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const [row] = await db
    .select({
      id: topicProposals.id,
      candidateName: topicProposals.candidateName,
      status: topicProposals.status,
      proposedByUserId: topicProposals.proposedByUserId,
    })
    .from(topicProposals)
    .where(eq(topicProposals.id, proposalId))
    .limit(1);
  return row ?? null;
}

describe("E2E: self-delete removes personal data and tokens, preserves audit history", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.SESSION_SECRET = "test-session-secret-78-characters-long-xxxx";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.SESSION_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "removes profile, sessions, calendar connections (with tokens), availability, and topic associations while preserving the approved Topic Proposal as audit history",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = getTestClock()();

      await db.insert(users).values({
        id: USER_ID,
        email: USER_EMAIL,
        displayName: "Audit Subject",
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(sessions).values({
        id: SESSION_ID,
        userId: USER_ID,
        csrfToken: CSRF_TOKEN,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: now,
      });

      await db.insert(calendarConnections).values([
        {
          id: GOOGLE_CONNECTION_ID,
          userId: USER_ID,
          provider: "google",
          providerAccountKey: "google:audit-subject",
          accountIdentifier: "audit-subject@gmail.com",
          scopes: "https://www.googleapis.com/auth/calendar.freebusy",
          status: "connected",
          refreshTokenEncrypted: "encrypted-refresh-token",
          accessTokenEncrypted: "encrypted-access-token",
          accessTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
          contributingCalendarIds: [],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: MICROSOFT_CONNECTION_ID,
          userId: USER_ID,
          provider: "microsoft",
          providerAccountKey: "microsoft:audit-subject",
          accountIdentifier: "audit-subject@outlook.com",
          scopes: "Calendars.Read",
          status: "connected",
          refreshTokenEncrypted: "encrypted-ms-refresh",
          accessTokenEncrypted: "encrypted-ms-access",
          accessTokenExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
          contributingCalendarIds: [],
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await db.insert(emailEvents).values([
        {
          id: PERSONAL_EMAIL_EVENT_ID,
          recipient: USER_EMAIL,
          type: "magic-link",
          payloadReference: "unrelated-payload-reference",
          status: "sent",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: CONNECTION_EMAIL_EVENT_ID,
          recipient: "operations@example.com",
          type: "calendar-action-required",
          payloadReference: createConnectionActionRequiredDedupReference(
            GOOGLE_CONNECTION_ID,
            "token-revoked",
          ),
          status: "sent",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: UNRELATED_EMAIL_EVENT_ID,
          recipient: "unrelated@example.com",
          type: "magic-link",
          payloadReference: "unrelated-reference",
          status: "sent",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: PREFIX_EMAIL_EVENT_ID,
          recipient: "unrelated-prefix@example.com",
          type: "calendar-action-required",
          payloadReference: `prefix-${createConnectionActionRequiredDedupReference(
            GOOGLE_CONNECTION_ID,
            "token-revoked",
          )}`,
          status: "sent",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(emailEventAttempts).values({
        id: "00000000-0000-0000-0000-00000000e578",
        emailEventId: PERSONAL_EMAIL_EVENT_ID,
        attemptNumber: 1,
        status: "delivered",
        attemptedAt: now,
        createdAt: now,
      });

      await db.insert(availabilityWindows).values({
        id: "00000000-0000-0000-0000-0000000f0078",
        userId: USER_ID,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        profileTimezone: "UTC",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(availabilityOverrides).values({
        id: "00000000-0000-0000-0000-0000000f1078",
        userId: USER_ID,
        date: "2099-07-15",
        startTime: "12:00",
        endTime: "13:00",
        type: "add",
        profileTimezone: "UTC",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(discoverabilityConsents).values({
        userId: USER_ID,
        grantedAt: now,
      });

      await db.insert(importedBusyIntervals).values({
        id: "00000000-0000-0000-0000-0000000f2078",
        userId: USER_ID,
        connectionId: GOOGLE_CONNECTION_ID,
        providerCalendarId: "primary",
        providerEventReference: "evt-audit-subject-1",
        status: "busy",
        startAt: new Date("2099-07-15T15:00:00.000Z"),
        endAt: new Date("2099-07-15T16:00:00.000Z"),
        importedAt: now,
      });

      const seededTopicId = "00000000-0000-0000-0000-00000000c178";
      await db.insert(topics).values({
        id: seededTopicId,
        name: "Seeded Topic for User Topic Link",
        status: "active",
        retiredAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(userTopics).values({
        id: "00000000-0000-0000-0000-00000000c278",
        userId: USER_ID,
        topicId: seededTopicId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(topicProposals).values({
        id: PROPOSAL_ID,
        proposedByUserId: USER_ID,
        candidateName: PROPOSAL_NAME,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(users).values({
        id: ADMIN_ID,
        email: "audit-admin@example.com",
        displayName: "Audit Admin",
        role: "admin",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(sessions).values({
        id: "00000000-0000-0000-0000-00000000b179",
        userId: ADMIN_ID,
        csrfToken: "csrf-admin-audit-78",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: now,
      });

      const { POST } = createAdminTopicProposalsHandlers();
      const adminCookie = await sealSessionCookie({
        sessionId: "00000000-0000-0000-0000-00000000b179",
      });
      const approveResponse = await POST(
        new Request("http://localhost/admin/topic-proposals", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: adminCookie,
          },
          body: new URLSearchParams({
            id: PROPOSAL_ID,
            action: "approve",
            _csrf: "csrf-admin-audit-78",
          }).toString(),
        }),
      );
      expect(approveResponse.status).toBe(303);

      const beforeProposal = await selectProposal(PROPOSAL_ID);
      expect(beforeProposal?.status).toBe("approved");
      expect(beforeProposal?.proposedByUserId).toBe(USER_ID);

      const userCookie = await sealSessionCookie({ sessionId: SESSION_ID });
      const deleteResponse = await DELETE(
        new Request("http://localhost/me", {
          method: "DELETE",
          headers: {
            cookie: userCookie,
            "x-csrf-token": CSRF_TOKEN,
          },
        }),
      );

      expect(deleteResponse.status).toBe(204);
      expect(deleteResponse.headers.get("set-cookie")).toContain("Max-Age=0");

      expect(await countRows("users", `id = '${USER_ID}'`)).toBe(0);
      expect(await countRows("sessions", `user_id = '${USER_ID}'`)).toBe(0);
      expect(
        await countRows("calendar_connections", `user_id = '${USER_ID}'`),
      ).toBe(0);
      expect(
        await countRows(
          "calendar_connections",
          `access_token_encrypted IN ('encrypted-access-token', 'encrypted-ms-access')`,
        ),
      ).toBe(0);
      expect(
        await countRows(
          "calendar_connections",
          `refresh_token_encrypted IN ('encrypted-refresh-token', 'encrypted-ms-refresh')`,
        ),
      ).toBe(0);
      expect(
        await countRows("availability_windows", `user_id = '${USER_ID}'`),
      ).toBe(0);
      expect(
        await countRows("availability_overrides", `user_id = '${USER_ID}'`),
      ).toBe(0);
      expect(
        await countRows("discoverability_consents", `user_id = '${USER_ID}'`),
      ).toBe(0);
      expect(
        await countRows("imported_busy_intervals", `user_id = '${USER_ID}'`),
      ).toBe(0);
      expect(await countRows("user_topics", `user_id = '${USER_ID}'`)).toBe(0);
      expect(
        await countRows(
          "email_events",
          `id IN ('${PERSONAL_EMAIL_EVENT_ID}', '${CONNECTION_EMAIL_EVENT_ID}')`,
        ),
      ).toBe(0);
      expect(
        await countRows(
          "email_event_attempts",
          `email_event_id = '${PERSONAL_EMAIL_EVENT_ID}'`,
        ),
      ).toBe(0);
      expect(
        await countRows(
          "email_events",
          `id IN ('${UNRELATED_EMAIL_EVENT_ID}', '${PREFIX_EMAIL_EVENT_ID}')`,
        ),
      ).toBe(2);

      const afterProposal = await selectProposal(PROPOSAL_ID);
      expect(afterProposal).not.toBeNull();
      expect(afterProposal?.id).toBe(PROPOSAL_ID);
      expect(afterProposal?.candidateName).toBe(PROPOSAL_NAME);
      expect(afterProposal?.status).toBe("approved");
      expect(afterProposal?.proposedByUserId).toBeNull();

      const createdTopic = await db
        .select({ id: topics.id })
        .from(topics)
        .where(eq(topics.name, PROPOSAL_NAME))
        .limit(1);
      expect(createdTopic).toHaveLength(1);
    },
  );
});
