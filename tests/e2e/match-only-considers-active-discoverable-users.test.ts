import { afterEach, describe, expect, inject, it } from "vitest";

import {
  type ProfileInputs,
  setSearchEligibilityProfileInputsForTests,
} from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { createMatchingDependencies } from "../../src/matching";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const POSITIVE_CONTROL = USER_FIXTURES[0];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const SLOT_START_UTC = "2026-07-13T16:00:00.000Z";
const SLOT_END_UTC = "2026-07-13T17:00:00.000Z";
const DURATION_MINUTES = 60;

const SUSPENDED_USER_ID = "00000000-0000-0000-0000-0000000000f1";
const REVOKED_USER_ID = "00000000-0000-0000-0000-000000000101";

const COMPLETE_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: true,
};

const ELIGIBILITY_INPUTS: Record<string, ProfileInputs> = {
  [POSITIVE_CONTROL.id]: COMPLETE_PROFILE,
  [USER_FIXTURES[1].id]: COMPLETE_PROFILE,
  [SUSPENDED_USER_ID]: COMPLETE_PROFILE,
  [REVOKED_USER_ID]: COMPLETE_PROFILE,
};

type FixtureUserInput = {
  id: string;
  email: string;
  displayName: string;
  userStatus: "active" | "suspended";
  topicId: string;
};

async function insertFixtureUser(input: FixtureUserInput): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE).toISOString();
  await db.execute(
    `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
     VALUES ('${input.id}', '${input.email}', '${input.displayName}', 'user', '${input.userStatus}', 'UTC', 0, '${now}', '${now}')`,
  );
  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone, created_at, updated_at)
     VALUES (gen_random_uuid(), '${input.id}', 1, '00:00', '23:59', 'UTC', '${now}', '${now}')`,
  );
  await db.execute(
    `INSERT INTO user_topics (id, user_id, topic_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${input.id}', '${input.topicId}', 'active', '${now}', '${now}')`,
  );
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
      matchingDependencies: createMatchingDependencies(),
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

describe("E2E: Match only considers active discoverable Users", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "excludes a suspended User from the persisted Search Result snapshot",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await grantDiscoverabilityConsent(POSITIVE_CONTROL.id);
      setSearchEligibilityProfileInputsForTests(ELIGIBILITY_INPUTS);
      await insertFixtureUser({
        id: SUSPENDED_USER_ID,
        email: "suspended@example.com",
        displayName: "Suspended User",
        userStatus: "suspended",
        topicId: SELECTED_TOPIC.id,
      });
      await grantDiscoverabilityConsent(SUSPENDED_USER_ID);

      const searchId = await runSearch();
      const snapshot = await loadSnapshot(searchId);
      const matches = matchedUserIds(snapshot);

      expect(matches).toContain(POSITIVE_CONTROL.id);
      expect(matches).not.toContain(SUSPENDED_USER_ID);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "excludes a User without discoverability from the persisted Search Result snapshot",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await grantDiscoverabilityConsent(POSITIVE_CONTROL.id);
      setSearchEligibilityProfileInputsForTests(ELIGIBILITY_INPUTS);
      await insertFixtureUser({
        id: REVOKED_USER_ID,
        email: "revoked@example.com",
        displayName: "Revoked Discoverability User",
        userStatus: "active",
        topicId: SELECTED_TOPIC.id,
      });

      const searchId = await runSearch();
      const snapshot = await loadSnapshot(searchId);
      const matches = matchedUserIds(snapshot);

      expect(matches).toContain(POSITIVE_CONTROL.id);
      expect(matches).not.toContain(REVOKED_USER_ID);
    },
  );
});
