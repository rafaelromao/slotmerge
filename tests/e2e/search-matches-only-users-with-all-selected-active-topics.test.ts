import { afterEach, describe, expect, inject, it } from "vitest";

import { submitSearch } from "../../src/search/search-input";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { getSearchRepository } from "../../src/search/repository";
import { getTopicCatalogueRepository } from "../../src/topics/repository";
import { getProfileByUserId } from "../../src/profile/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const TOPIC_A = TOPIC_FIXTURES[0];
const TOPIC_B = TOPIC_FIXTURES[1];

const SLOT_DATE = "2026-07-13";
const SLOT_START_UTC = `${SLOT_DATE}T16:00:00.000Z`;
const SLOT_END_UTC = `${SLOT_DATE}T17:00:00.000Z`;

const SUBSET_A_ID = "00000000-0000-0000-0000-0000000000a1";
const SUBSET_B_ID = "00000000-0000-0000-0000-0000000000b1";
const NEITHER_ID = "00000000-0000-0000-0000-0000000000c1";
const SUBSET_A_EMAIL = "subset-a@example.com";
const SUBSET_B_EMAIL = "subset-b@example.com";
const NEITHER_EMAIL = "neither@example.com";

const TOPIC_A_NAME = "Product strategy";
const TOPIC_B_NAME = "AI engineering";

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

async function grantDiscoverabilityConsentForUser(
  userId: string,
): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE).toISOString();
  await db.execute(
    `INSERT INTO discoverability_consents (user_id, granted_at) VALUES ('${userId}', '${now}')`,
  );
}

async function seedNegativeCaseUsers(): Promise<void> {
  await insertDiscoverableUser({
    id: SUBSET_A_ID,
    email: SUBSET_A_EMAIL,
    displayName: "Subset A",
    topicIds: [TOPIC_A.id],
  });
  await insertDiscoverableUser({
    id: SUBSET_B_ID,
    email: SUBSET_B_EMAIL,
    displayName: "Subset B",
    topicIds: [TOPIC_B.id],
  });
  await insertDiscoverableUser({
    id: NEITHER_ID,
    email: NEITHER_EMAIL,
    displayName: "Neither",
    topicIds: [],
  });
  await grantDiscoverabilityConsentForUser(USER_FIXTURES[0].id);
  await grantDiscoverabilityConsentForUser(USER_FIXTURES[1].id);
}

async function runSearchWithSelectedTopics(): Promise<string> {
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
      matchingPoolSize: 2,
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      searchResultRepository: createPostgresSearchResultRepository(),
    },
    {
      selectedTopicIds: [TOPIC_A.id, TOPIC_B.id],
      minimumMatchingUsers: 2,
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

function expectedMatch(
  userId: string,
  displayName: string,
): {
  userId: string;
  displayName: string;
  avatarUrl: null;
  shortBio: null;
  topics: Array<{ id: string; name: string }>;
  topicProfile: Array<{ id: string; name: string }>;
  availabilityIndicator: "available";
  calendarFreshness: "none";
} {
  return {
    userId,
    displayName,
    avatarUrl: null,
    shortBio: null,
    topics: [
      { id: TOPIC_A.id, name: TOPIC_A_NAME },
      { id: TOPIC_B.id, name: TOPIC_B_NAME },
    ],
    topicProfile: [
      { id: TOPIC_A.id, name: TOPIC_A_NAME },
      { id: TOPIC_B.id, name: TOPIC_B_NAME },
    ],
    availabilityIndicator: "available",
    calendarFreshness: "none",
  };
}

function assertSnapshotMatches(
  storedSelectedTopicIds: string[],
  snapshot: SearchSnapshotShape,
): void {
  expect(storedSelectedTopicIds).toEqual([TOPIC_A.id, TOPIC_B.id]);
  expect(snapshot).toEqual({
    generatedAt: "2026-07-12T12:00:00.001Z",
    organizerTimezone: "Europe/London",
    dateRangeStart: SLOT_START_UTC,
    dateRangeEnd: SLOT_END_UTC,
    durationMinutes: 60,
    slots: [
      {
        startUtc: SLOT_START_UTC,
        matchCount: 2,
        matches: [
          expectedMatch(USER_FIXTURES[0].id, "Alice User"),
          expectedMatch(USER_FIXTURES[1].id, "Bob Organizer"),
        ],
      },
    ],
  });
}

describe("E2E: Search matches only Users with all selected active Topics", () => {
  afterEach(() => {
  });

  it.runIf(HAS_TEST_DB)(
    "persisted Search Result snapshot includes Users with all selected active Topics and excludes Users missing any selected Topic",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await seedNegativeCaseUsers();

      const searchId = await runSearchWithSelectedTopics();
      const { storedSelectedTopicIds, snapshot } =
        await loadStoredSnapshot(searchId);
      assertSnapshotMatches(storedSelectedTopicIds, snapshot);
    },
  );
});
