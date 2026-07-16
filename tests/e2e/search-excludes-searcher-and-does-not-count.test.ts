import { afterEach, describe, expect, inject, it } from "vitest";

import { type ProfileInputs, setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { createMatchingDependencies } from "../../src/matching";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { getSearchRepository } from "../../src/search/repository";
import { getTopicCatalogueRepository } from "../../src/topics/repository";
import { getProfileByUserId } from "../../src/profile/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[1];
const TOPIC = TOPIC_FIXTURES[0];

const SLOT_DATE = "2026-07-13";
const SLOT_START_UTC = `${SLOT_DATE}T16:00:00.000Z`;
const SLOT_END_UTC = `${SLOT_DATE}T17:00:00.000Z`;

const OTHER_USER_A_ID = "00000000-0000-0000-0000-0000000000a1";
const OTHER_USER_A_EMAIL = "other-a@example.com";
const OTHER_USER_A_DISPLAY_NAME = "Other User A";

const OTHER_USER_B_ID = "00000000-0000-0000-0000-0000000000a2";
const OTHER_USER_B_EMAIL = "other-b@example.com";
const OTHER_USER_B_DISPLAY_NAME = "Other User B";

const COMPLETE_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: true,
};

async function insertDiscoverableUser(input: {
  id: string;
  email: string;
  displayName: string;
  topicIds: string[];
}): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE).toISOString();
  await db.execute(
    `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
     VALUES ('${input.id}', '${input.email}', '${input.displayName}', 'user', 'active', 'UTC', 0, '${now}', '${now}')`,
  );
  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone, created_at, updated_at)
     VALUES (gen_random_uuid(), '${input.id}', 1, '00:00', '23:59', 'UTC', '${now}', '${now}')`,
  );
  for (const topicId of input.topicIds) {
    await db.execute(
      `INSERT INTO user_topics (id, user_id, topic_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), '${input.id}', '${topicId}', 'active', '${now}', '${now}')`,
    );
  }
  await db.execute(
    `INSERT INTO discoverability_consents (user_id, granted_at) VALUES ('${input.id}', '${now}')`,
  );
}

async function grantDiscoverabilityConsentForUser(userId: string): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE).toISOString();
  await db.execute(
    `INSERT INTO discoverability_consents (user_id, granted_at) VALUES ('${userId}', '${now}')`,
  );
}

async function runSearchWithMinimum(minimumMatchingUsers: number): Promise<string> {
  const result = await submitSearch(
    {
      organizerId: ORGANIZER.id,
      activeTopicsRepository: {
        async listActive() {
          const catalogue = await getTopicCatalogueRepository().listCatalogue();
          return catalogue
            .filter((t) => t.status === "active")
            .map((t) => ({
              id: t.id,
              name: t.name,
              status: "active" as const,
            }));
        },
      },
      profileRepository: {
        async findByUserId(userId) {
          return getProfileByUserId(userId);
        },
      },
      clock: { now: getTestClock() },
      matchingPoolSize: 3,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      searchResultRepository: createPostgresSearchResultRepository(),
    },
    {
      selectedTopicIds: [TOPIC.id],
      minimumMatchingUsers,
      durationMinutes: 60,
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

type SnapshotRow = {
  snapshot_json: unknown;
};

type SearchSnapshotShape = {
  generatedAt: string;
  organizerTimezone: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  durationMinutes: number;
  slots: Array<{
    startUtc: string;
    matchCount: number;
    matches: Array<{
      userId: string;
      displayName: string | null;
      avatarUrl: string | null;
      shortBio: string | null;
      topics: Array<{ id: string; name: string }>;
      topicProfile: Array<{ id: string; name: string }>;
      availabilityIndicator: string;
      calendarFreshness: string;
    }>;
  }>;
};

async function loadStoredSnapshot(searchId: string): Promise<{
  storedSelectedTopicIds: string[];
  snapshot: SearchSnapshotShape;
}> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const stored = await getSearchRepository().findById(searchId);
  const result = await db.execute<SnapshotRow>(
    `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`no search_results row for search_id ${searchId}`);
  }
  return {
    storedSelectedTopicIds: stored?.selectedTopicIds ?? [],
    snapshot: row.snapshot_json as SearchSnapshotShape,
  };
}

describe("E2E: Search excludes the Organizer and the Organizer does not count", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "AC1: Organizer never appears in candidates - with 2 non-Organizer qualifying users, slots appear and Organizer is absent from matches",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      await insertDiscoverableUser({
        id: OTHER_USER_A_ID,
        email: OTHER_USER_A_EMAIL,
        displayName: OTHER_USER_A_DISPLAY_NAME,
        topicIds: [TOPIC.id],
      });

      await insertDiscoverableUser({
        id: OTHER_USER_B_ID,
        email: OTHER_USER_B_EMAIL,
        displayName: OTHER_USER_B_DISPLAY_NAME,
        topicIds: [TOPIC.id],
      });

      await grantDiscoverabilityConsentForUser(ORGANIZER.id);

      setSearchEligibilityProfileInputsForTests({
        [ORGANIZER.id]: COMPLETE_PROFILE,
        [OTHER_USER_A_ID]: COMPLETE_PROFILE,
        [OTHER_USER_B_ID]: COMPLETE_PROFILE,
      });

      const searchId = await runSearchWithMinimum(2);
      const { snapshot } = await loadStoredSnapshot(searchId);

      expect(snapshot.slots.length).toBeGreaterThan(0);

      for (const slot of snapshot.slots) {
        const matchUserIds = slot.matches.map((m) => m.userId);
        expect(matchUserIds).not.toContain(ORGANIZER.id);
        expect(matchUserIds).toContain(OTHER_USER_A_ID);
        expect(matchUserIds).toContain(OTHER_USER_B_ID);
      }
    },
  );

  it.runIf(HAS_TEST_DB)(
    "AC2: minimum count excludes the Organizer - Organizer + 2 others qualify with minimum=3, matchCount is 2 (Organizer not counted)",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      await insertDiscoverableUser({
        id: OTHER_USER_A_ID,
        email: OTHER_USER_A_EMAIL,
        displayName: OTHER_USER_A_DISPLAY_NAME,
        topicIds: [TOPIC.id],
      });

      await insertDiscoverableUser({
        id: OTHER_USER_B_ID,
        email: OTHER_USER_B_EMAIL,
        displayName: OTHER_USER_B_DISPLAY_NAME,
        topicIds: [TOPIC.id],
      });

      await grantDiscoverabilityConsentForUser(ORGANIZER.id);

      setSearchEligibilityProfileInputsForTests({
        [ORGANIZER.id]: COMPLETE_PROFILE,
        [OTHER_USER_A_ID]: COMPLETE_PROFILE,
        [OTHER_USER_B_ID]: COMPLETE_PROFILE,
      });

      const searchId = await runSearchWithMinimum(3);
      const { snapshot } = await loadStoredSnapshot(searchId);

      expect(snapshot.slots.length).toBeGreaterThan(0);

      const allMatchCounts = snapshot.slots.map((s) => s.matchCount);
      expect(allMatchCounts.every((count) => count === 2)).toBe(true);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "AC2 variant: when only Organizer qualifies with minimum=2, no slots are returned",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      await grantDiscoverabilityConsentForUser(ORGANIZER.id);

      setSearchEligibilityProfileInputsForTests({
        [ORGANIZER.id]: COMPLETE_PROFILE,
      });

      const searchId = await runSearchWithMinimum(2);
      const { snapshot } = await loadStoredSnapshot(searchId);

      expect(snapshot.slots.length).toBe(0);
    },
  );
});
