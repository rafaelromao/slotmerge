import { afterEach, describe, expect, inject, it } from "vitest";

import {
  type ProfileInputs,
  setSearchEligibilityProfileInputsForTests,
} from "../../src/search/eligibility";
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

const COMPLETE_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
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

type SnapshotRow = {
  snapshot_json: unknown;
};

async function loadSnapshotJson(searchId: string): Promise<unknown> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<SnapshotRow>(
    `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`no search_results row for search_id ${searchId}`);
  }
  return row.snapshot_json;
}

describe("E2E: Search matches only Users with all selected active Topics", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
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

      setSearchEligibilityProfileInputsForTests({
        [USER_FIXTURES[0].id]: COMPLETE_PROFILE,
        [USER_FIXTURES[1].id]: COMPLETE_PROFILE,
        [SUBSET_A_ID]: COMPLETE_PROFILE,
        [SUBSET_B_ID]: COMPLETE_PROFILE,
        [NEITHER_ID]: COMPLETE_PROFILE,
      });

      const result = await submitSearch(
        {
          organizerId: ORGANIZER.id,
          activeTopicsRepository: {
            async listActive() {
              const catalogue =
                await getTopicCatalogueRepository().listCatalogue();
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
          matchingDependencies: createMatchingDependencies(),
          discoverableUserRepository:
            createPostgresDiscoverableUserRepository(),
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
      if (!result.ok) {
        return;
      }

      const storedSearchId = result.search.id;
      expect(storedSearchId).toBeTruthy();
      if (!storedSearchId) {
        return;
      }

      const persisted = getSearchRepository();
      const stored = await persisted.findById(storedSearchId);
      expect(stored?.selectedTopicIds).toEqual([TOPIC_A.id, TOPIC_B.id]);

      const snapshot = (await loadSnapshotJson(storedSearchId)) as {
        slots: Array<{
          matches: Array<{ userId: string }>;
        }>;
      };

      const matchedUserIds = new Set<string>();
      for (const slot of snapshot.slots) {
        for (const match of slot.matches) {
          matchedUserIds.add(match.userId);
        }
      }

      const expectedMatches = new Set([
        USER_FIXTURES[0].id,
        USER_FIXTURES[1].id,
      ]);
      expect(matchedUserIds).toEqual(expectedMatches);
    },
  );
});
