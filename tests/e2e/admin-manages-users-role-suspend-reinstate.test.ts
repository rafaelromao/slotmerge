import { afterEach, describe, expect, inject, it } from "vitest";

import { createAdminUsersHandlers } from "../../src/admin/users";
import {
  createMagicLinkRequestHandlers,
} from "../../src/auth/magic-link-request";
import { sealSessionCookie } from "../../src/auth/session";
import {
  invites,
  sessions,
} from "../../src/db/schema";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";
import {
  type ProfileInputs,
  setSearchEligibilityProfileInputsForTests,
} from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { createMatchingDependencies } from "../../src/matching";
import {
  createPostgresDiscoverableUserRepository,
} from "../../src/search/drizzle-discoverable-user-repository";
import {
  createPostgresSearchResultRepository,
} from "../../src/search/drizzle-search-result-repository";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { getProfileByUserId } from "../../src/profile/repository";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ADMIN = USER_FIXTURES[2];
const TARGET_USER = USER_FIXTURES[0];
const ORGANIZER = USER_FIXTURES[1];
const TOPIC = TOPIC_FIXTURES[0];

const SLOT_START_UTC = "2026-07-13T16:00:00.000Z";
const SLOT_END_UTC = "2026-07-13T17:00:00.000Z";
const DURATION_MINUTES = 60;

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
};

async function readUserById(
  db: NonNullable<ReturnType<typeof getTestDb>>,
  userId: string,
): Promise<UserRow | null> {
  const result = await db.execute<UserRow>(
    `SELECT id, email, role, status FROM users WHERE id = '${userId}' LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

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

async function insertPendingInvite({
  db,
  inviteId,
  email,
  role,
  invitedByAdminId,
  expiresAt,
  now,
}: {
  db: NonNullable<ReturnType<typeof getTestDb>>;
  inviteId: string;
  email: string;
  role: string;
  invitedByAdminId: string;
  expiresAt: Date;
  now: Date;
}): Promise<void> {
  await db.insert(invites).values({
    id: inviteId,
    email,
    role: role as "user" | "organizer" | "admin",
    status: "pending",
    invitedByAdminId,
    expiresAt,
    createdAt: now,
  });
}

async function insertActiveUserWithProfileViaRawSql({
  db,
  userId,
  email,
  displayName,
  topicId,
  now,
}: {
  db: NonNullable<ReturnType<typeof getTestDb>>;
  userId: string;
  email: string;
  displayName: string;
  topicId: string;
  now: Date;
}): Promise<void> {
  const nowStr = now.toISOString();
  await db.execute(
    `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
     VALUES ('${userId}', '${email}', '${displayName}', 'user', 'active', 'UTC', 0, '${nowStr}', '${nowStr}')`,
  );
  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone, created_at, updated_at)
     VALUES (gen_random_uuid(), '${userId}', 1, '00:00', '23:59', 'UTC', '${nowStr}', '${nowStr}')`,
  );
  await db.execute(
    `INSERT INTO user_topics (id, user_id, topic_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${userId}', '${topicId}', 'active', '${nowStr}', '${nowStr}')`,
  );
  await grantDiscoverabilityConsent(userId);
}

function extractCsrfToken(html: string): string {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) {
    throw new Error(`CSRF token not found in HTML: ${html.slice(0, 200)}`);
  }
  return match[1];
}

function extractUserIdFromActionForm(html: string, email: string): string | null {
  const emailPattern = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowMatch = html.match(
    new RegExp(`<tr>[\\s\\S]*?${emailPattern}[\\s\\S]*?<input type="hidden" name="userId" value="([^"]+)"[\\s\\S]*?</tr>`, "m"),
  );
  return rowMatch ? rowMatch[1] : null;
}

function extractUserRow(html: string, email: string): string | null {
  const emailPattern = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowMatch = html.match(
    new RegExp(`<tr>[\\s\\S]*?${emailPattern}[\\s\\S]*?</tr>`, "m"),
  );
  return rowMatch ? rowMatch[0] : null;
}

type SearchSnapshotShape = {
  slots: Array<{
    startUtc: string;
    matchCount: number;
    matches: Array<{ userId: string }>;
  }>;
};

async function runSearch(organizerId: string, poolSize: number): Promise<string> {
  const result = await submitSearch(
    {
      organizerId,
      activeTopicsRepository: {
        async listActive() {
          return await Promise.resolve([
            {
              id: TOPIC.id,
              name: TOPIC.name,
              status: "active" as const,
            },
          ]);
        },
      },
      profileRepository: {
        async findByUserId(uid) {
          return getProfileByUserId(uid);
        },
      },
      clock: { now: getTestClock() },
      matchingPoolSize: poolSize,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      searchResultRepository: createPostgresSearchResultRepository(),
    },
    {
      selectedTopicIds: [TOPIC.id],
      minimumMatchingUsers: 2,
      durationMinutes: DURATION_MINUTES,
      dateRangeStart: new Date(SLOT_START_UTC),
      dateRangeEnd: new Date(SLOT_END_UTC),
      organizerTimezone: "UTC",
    },
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("submitSearch did not produce a stored search id");
  }
  return result.search.id;
}

async function loadSnapshot(searchId: string): Promise<SearchSnapshotShape> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ snapshot_json: unknown }>(
    `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`no search_results row for search_id ${searchId}`);
  }
  return row.snapshot_json as SearchSnapshotShape;
}

function matchedUserIds(snapshot: SearchSnapshotShape): string[] {
  return snapshot.slots.flatMap((s) => s.matches.map((m) => m.userId));
}

const COMPLETE_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: true,
};

const SUSPENDED_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: false,
};

describe("E2E: Admin lists, changes role, suspends, and reinstates Users", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "Slice 1: Admin lists users and changes role from User to Organizer",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminSessionId = "00000000-0000-0000-0000-00000000c001";
      const adminCsrfToken = "admin-csrf-c001";

      await insertAdminSession({
        db,
        sessionId: adminSessionId,
        userId: ADMIN.id,
        csrfToken: adminCsrfToken,
        now,
      });

      const adminCookie = await sealSessionCookie({
        sessionId: adminSessionId,
      });
      const { GET, POST } = createAdminUsersHandlers();

      const getResponse = await GET(
        new Request("http://localhost/admin/users", {
          headers: { cookie: adminCookie },
        }),
      );

      expect(getResponse.status).toBe(200);
      const html = await getResponse.text();
      expect(html).toContain("Users");
      expect(html).toContain(TARGET_USER.email);

      const targetUserId = extractUserIdFromActionForm(html, TARGET_USER.email);
      expect(targetUserId).not.toBeNull();

      const csrfToken = extractCsrfToken(html);

      const postResponse = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: adminCookie,
          },
          body: new URLSearchParams({
            _csrf: csrfToken,
            action: "change-role",
            userId: targetUserId!,
            role: "organizer",
          }).toString(),
        }),
      );

      expect(postResponse.status).toBe(303);
      expect(postResponse.headers.get("location")).toBe(
        "http://localhost/admin/users",
      );

      const updatedUser = await readUserById(db, TARGET_USER.id);
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.role).toBe("organizer");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 2: Admin suspends a user, status changes to suspended and UI shows Reinstate",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminSessionId = "00000000-0000-0000-0000-00000000c002";
      const adminCsrfToken = "admin-csrf-c002";

      await insertAdminSession({
        db,
        sessionId: adminSessionId,
        userId: ADMIN.id,
        csrfToken: adminCsrfToken,
        now,
      });

      const adminCookie = await sealSessionCookie({
        sessionId: adminSessionId,
      });
      const { GET, POST } = createAdminUsersHandlers();

      const getResponse = await GET(
        new Request("http://localhost/admin/users", {
          headers: { cookie: adminCookie },
        }),
      );

      expect(getResponse.status).toBe(200);
      const htmlBefore = await getResponse.text();

      const targetUserId = extractUserIdFromActionForm(htmlBefore, TARGET_USER.email);
      expect(targetUserId).not.toBeNull();

      const csrfToken = extractCsrfToken(htmlBefore);

      const postResponse = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: adminCookie,
          },
          body: new URLSearchParams({
            _csrf: csrfToken,
            action: "suspend",
            userId: targetUserId!,
          }).toString(),
        }),
      );

      expect(postResponse.status).toBe(303);

      const updatedUser = await readUserById(db, TARGET_USER.id);
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.status).toBe("suspended");

      const getResponseAfter = await GET(
        new Request("http://localhost/admin/users", {
          headers: { cookie: adminCookie },
        }),
      );
      const htmlAfter = await getResponseAfter.text();

      const userRowHtml = extractUserRow(htmlAfter, TARGET_USER.email);
      expect(userRowHtml).not.toBeNull();
      expect(userRowHtml!).toContain("Suspended");
      expect(userRowHtml!).toContain('value="reinstate"');
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 3: Suspended user cannot authenticate via magic link request",
    async () => {
      await setupTest();

      const now = getTestClock()();
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      const targetUserId = "00000000-0000-0000-0000-00000000c003";
      const targetEmail = "suspended-c3@example.com";

      await db.execute(
        `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
         VALUES ('${targetUserId}', '${targetEmail}', 'Suspended Test User', 'user', 'suspended', 'UTC', 0, '${now.toISOString()}', '${now.toISOString()}')`,
      );

      const { POST } = createMagicLinkRequestHandlers({
        clock: () => new Date(FIXTURE_DATE),
        magicLinkSecret: "test-magic-link-secret-80",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: targetEmail }),
        }),
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("not_invited");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 4: Suspended user does not appear in Search Result snapshot",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const suspendedUserId = "00000000-0000-0000-0000-00000000c004";
      const suspendedEmail = "suspended-search-c4@example.com";

      await insertActiveUserWithProfileViaRawSql({
        db,
        userId: suspendedUserId,
        email: suspendedEmail,
        displayName: "Suspended Search User",
        topicId: TOPIC.id,
        now,
      });

      await db.execute(
        `UPDATE users SET status = 'suspended', updated_at = '${now.toISOString()}' WHERE id = '${suspendedUserId}'`,
      );

      await grantDiscoverabilityConsent(ORGANIZER.id);
      await grantDiscoverabilityConsent(TARGET_USER.id);

      setSearchEligibilityProfileInputsForTests({
        [ORGANIZER.id]: COMPLETE_PROFILE,
        [TARGET_USER.id]: COMPLETE_PROFILE,
        [suspendedUserId]: SUSPENDED_PROFILE,
      });

      const searchId = await runSearch(ORGANIZER.id, 2);
      const snapshot = await loadSnapshot(searchId);
      const matches = matchedUserIds(snapshot);

      expect(matches).toContain(ORGANIZER.id);
      expect(matches).not.toContain(suspendedUserId);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 5: Admin reinstates a suspended user, status changes to active",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminSessionId = "00000000-0000-0000-0000-00000000c005";
      const adminCsrfToken = "admin-csrf-c005";

      const targetUserId = "00000000-0000-0000-0000-00000000c005";
      const targetEmail = "reinstate-c5@example.com";

      await db.execute(
        `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
         VALUES ('${targetUserId}', '${targetEmail}', 'Reinstate Test User', 'user', 'suspended', 'UTC', 0, '${now.toISOString()}', '${now.toISOString()}')`,
      );

      await insertAdminSession({
        db,
        sessionId: adminSessionId,
        userId: ADMIN.id,
        csrfToken: adminCsrfToken,
        now,
      });

      const adminCookie = await sealSessionCookie({
        sessionId: adminSessionId,
      });
      const { GET, POST } = createAdminUsersHandlers();

      const getResponse = await GET(
        new Request("http://localhost/admin/users", {
          headers: { cookie: adminCookie },
        }),
      );

      expect(getResponse.status).toBe(200);
      const htmlBefore = await getResponse.text();

      const targetUserIdFromForm = extractUserIdFromActionForm(htmlBefore, targetEmail);
      expect(targetUserIdFromForm).not.toBeNull();

      const csrfToken = extractCsrfToken(htmlBefore);

      const postResponse = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: adminCookie,
          },
          body: new URLSearchParams({
            _csrf: csrfToken,
            action: "reinstate",
            userId: targetUserIdFromForm!,
          }).toString(),
        }),
      );

      expect(postResponse.status).toBe(303);

      const updatedUser = await readUserById(db, targetUserId);
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.status).toBe("active");

      const getResponseAfter = await GET(
        new Request("http://localhost/admin/users", {
          headers: { cookie: adminCookie },
        }),
      );
      const htmlAfter = await getResponseAfter.text();

      const userRowHtml = extractUserRow(htmlAfter, targetEmail);
      expect(userRowHtml).not.toBeNull();
      expect(userRowHtml!).toContain("Active");
      expect(userRowHtml!).toContain('value="suspend"');
      expect(userRowHtml!).not.toContain('value="reinstate"');
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 6: Reinstated user can authenticate and matches in Search",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const reinstatedUserId = "00000000-0000-0000-0000-00000000c006";
      const reinstatedEmail = "reinstate-auth-c6@example.com";
      const inviteId = "00000000-0000-0000-0000-00000000c007";
      const expiresAt = new Date("2099-01-01T00:00:00.000Z");

      await insertActiveUserWithProfileViaRawSql({
        db,
        userId: reinstatedUserId,
        email: reinstatedEmail,
        displayName: "Reinstate Auth User",
        topicId: TOPIC.id,
        now,
      });

      await grantDiscoverabilityConsent(ORGANIZER.id);

      await insertPendingInvite({
        db,
        inviteId,
        email: reinstatedEmail,
        role: "user",
        invitedByAdminId: ADMIN.id,
        expiresAt,
        now,
      });

      setSearchEligibilityProfileInputsForTests({
        [ORGANIZER.id]: COMPLETE_PROFILE,
        [reinstatedUserId]: COMPLETE_PROFILE,
      });

      const { POST: requestPost } = createMagicLinkRequestHandlers({
        clock: () => new Date(FIXTURE_DATE),
        magicLinkSecret: "test-magic-link-secret-80",
      });

      const requestResponse = await requestPost(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: reinstatedEmail }),
        }),
      );

      expect(requestResponse.status).toBe(200);
      const requestBody = (await requestResponse.json()) as { sent?: boolean };
      expect(requestBody.sent).toBe(true);

      const searchId = await runSearch(ORGANIZER.id, 2);
      const snapshot = await loadSnapshot(searchId);
      const matches = matchedUserIds(snapshot);

      expect(matches).toContain(ORGANIZER.id);
      expect(matches).toContain(reinstatedUserId);
    },
  );
});
