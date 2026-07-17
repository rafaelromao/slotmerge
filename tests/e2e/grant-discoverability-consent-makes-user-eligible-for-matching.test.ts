import { afterEach, describe, expect, inject, it } from "vitest";

import { submitSearch } from "../../src/search/search-input";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const SECONDARY_ELIGIBLE_USER = USER_FIXTURES[0];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const SLOT_START_UTC = "2026-07-13T16:00:00.000Z";
const SLOT_END_UTC = "2026-07-13T17:00:00.000Z";
const DURATION_MINUTES = 60;

const NEW_USER_ID = "00000000-0000-0000-0000-0000000000d1";
const NEW_USER_EMAIL = "newly-consented@example.com";
const NEW_USER_DISPLAY_NAME = "Newly Consented User";

async function insertFixtureUserWithoutConsent(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE).toISOString();
  await db.execute(
    `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
     VALUES ('${NEW_USER_ID}', '${NEW_USER_EMAIL}', '${NEW_USER_DISPLAY_NAME}', 'user', 'active', 'UTC', 0, '${now}', '${now}')`,
  );
  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone, created_at, updated_at)
     VALUES (gen_random_uuid(), '${NEW_USER_ID}', 1, '00:00', '23:59', 'UTC', '${now}', '${now}')`,
  );
  await db.execute(
    `INSERT INTO user_topics (id, user_id, topic_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${NEW_USER_ID}', '${SELECTED_TOPIC.id}', 'active', '${now}', '${now}')`,
  );
}

async function readConsentRow(
  userId: string,
): Promise<{ user_id: string; granted_at: string } | undefined> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ user_id: string; granted_at: string }>(
    `SELECT user_id, granted_at FROM discoverability_consents WHERE user_id = '${userId}'`,
  );
  return result.rows[0];
}

async function runSearch(): Promise<string> {
  const result = await submitSearch(
    {
      organizerId: ORGANIZER.id,
      activeTopicsRepository: {
        async listActive() {
          return await Promise.resolve([
            {
              id: SELECTED_TOPIC.id,
              name: SELECTED_TOPIC.name,
              status: "active" as const,
            },
          ]);
        },
      },
      profileRepository: {
        async findByUserId() {
          return await Promise.resolve(null);
        },
      },
      clock: { now: getTestClock() },
      matchingPoolSize: 2,
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      searchResultRepository: createPostgresSearchResultRepository(),
    },
    {
      selectedTopicIds: [SELECTED_TOPIC.id],
      minimumMatchingUsers: 2,
      durationMinutes: DURATION_MINUTES,
      dateRangeStart: new Date(SLOT_START_UTC),
      dateRangeEnd: new Date(SLOT_END_UTC),
      organizerTimezone: ORGANIZER.profileTimezone ?? "UTC",
    },
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("submitSearch did not produce a stored search id");
  }
  return result.search.id;
}

type SearchSnapshotShape = {
  slots: Array<{
    startUtc: string;
    matchCount: number;
    matches: Array<{ userId: string }>;
  }>;
};

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

describe("E2E: Grant discoverability consent makes User eligible for matching", () => {
  afterEach(() => {
  });

  it.runIf(HAS_TEST_DB)(
    "persists a discoverability_consents row with a granted_at timestamp",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertFixtureUserWithoutConsent();

      const beforeGrant = await readConsentRow(NEW_USER_ID);
      expect(beforeGrant).toBeUndefined();

      const record = await grantDiscoverabilityConsent(NEW_USER_ID);
      expect(record.userId).toBe(NEW_USER_ID);
      expect(record.grantedAt).toBeInstanceOf(Date);

      const afterGrant = await readConsentRow(NEW_USER_ID);
      expect(afterGrant?.user_id).toBe(NEW_USER_ID);
      expect(afterGrant?.granted_at).toBeTruthy();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "includes the User in the persisted Search Result snapshot after consent is granted",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertFixtureUserWithoutConsent();
      await grantDiscoverabilityConsent(NEW_USER_ID);
      await grantDiscoverabilityConsent(SECONDARY_ELIGIBLE_USER.id);

      const searchId = await runSearch();
      const snapshot = await loadSnapshot(searchId);
      const matches = matchedUserIds(snapshot);

      expect(matches).toContain(NEW_USER_ID);
    },
  );
});
