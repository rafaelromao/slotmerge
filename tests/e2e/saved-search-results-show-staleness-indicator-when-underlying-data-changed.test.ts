import { eq } from "drizzle-orm";
import { afterEach, describe, expect, inject, it } from "vitest";

import {
  availabilityWindows,
  discoverabilityConsents,
  userTopics,
  users,
} from "../../src/db/schema";
import { getProfileByUserId } from "../../src/profile/repository";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { getSearchRepository } from "../../src/search/repository";
import { submitSearch } from "../../src/search/search-input";
import {
  getSearchResultRepository,
  type SearchResultRecord,
} from "../../src/search/search-result-repository";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";
import { buildTestClock } from "../test-clock";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[1];
const MATCH_USER_ID = "00000000-0000-0000-0000-000000001131";
const MATCH_USER_EMAIL = "match-user-1131@example.com";
const MATCH_USER_DISPLAY_NAME = "Match User 1131";
const TOPIC = TOPIC_FIXTURES[0];

const DATE_RANGE_START = new Date("2026-07-13T12:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T18:00:00.000Z");
const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;

type SubmitDeps = Parameters<typeof submitSearch>[0];

function buildSubmitDeps(clock: { now: () => Date }): SubmitDeps {
  return {
    organizerId: ORGANIZER.id,
    activeTopicsRepository: {
      async listActive() {
        return (await listActiveTopics()).map(({ id, name }) => ({
          id,
          name,
          status: "active" as const,
        }));
      },
    },
    profileRepository: { findByUserId: getProfileByUserId },
    clock,
    matchingPoolSize: 5,
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  };
}

async function grantDiscoverabilityConsent(userId: string): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE);
  await db.insert(discoverabilityConsents).values({
    userId,
    grantedAt: now,
  });
}

async function seedMatchUser(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE);
  await db.insert(users).values({
    id: MATCH_USER_ID,
    email: MATCH_USER_EMAIL,
    displayName: MATCH_USER_DISPLAY_NAME,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(availabilityWindows).values({
    id: "00000000-0000-0000-0000-000000000200",
    userId: MATCH_USER_ID,
    dayOfWeek: 1,
    startTime: "00:00",
    endTime: "23:59",
    profileTimezone: "UTC",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(userTopics).values({
    id: "00000000-0000-0000-0000-000000000201",
    userId: MATCH_USER_ID,
    topicId: TOPIC.id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function loadSnapshotJson(
  searchId: string,
): Promise<SearchResultRecord["snapshotJson"]> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ snapshot_json: SearchResultRecord["snapshotJson"] }>(
    `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`no search_results row for search_id ${searchId}`);
  }
  return row.snapshot_json;
}

describe.runIf(HAS_TEST_DB)(
  "E2E: saved Search Results show staleness indicator when underlying data changed",
  () => {
    afterEach(() => {
    });

    it(
      "AC1: Snapshot content is unchanged after User availability is mutated",
      async () => {
        await setupTest();
        await seedMatchUser();
        await grantDiscoverabilityConsent(MATCH_USER_ID);

        const testClock = buildTestClock(new Date(FIXTURE_DATE));
        const result = await submitSearch(buildSubmitDeps({ now: () => testClock.now() }), {
          selectedTopicIds: [TOPIC.id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: DATE_RANGE_START,
          dateRangeEnd: DATE_RANGE_END,
          organizerTimezone: "UTC",
        });
        expect(result.ok).toBe(true);
        if (!result.ok || !result.search.id) {
          throw new Error("submitSearch did not produce a stored search id");
        }
        const searchId = result.search.id;

        const originalSnapshot = await loadSnapshotJson(searchId);

        const db = getTestDb();
        if (!db) {
          throw new Error("test db not initialized");
        }
        await db
          .update(availabilityWindows)
          .set({ startTime: "09:00", endTime: "10:00" })
          .where(eq(availabilityWindows.userId, MATCH_USER_ID));

        const reopenedSnapshot = await loadSnapshotJson(searchId);
        expect(reopenedSnapshot).toEqual(originalSnapshot);
      },
    );

    it(
      "AC2: Staleness indicator appears on re-open after clock advances past threshold",
      async () => {
        await setupTest();
        await seedMatchUser();
        await grantDiscoverabilityConsent(MATCH_USER_ID);

        const testClock = buildTestClock(new Date(FIXTURE_DATE));
        const result = await submitSearch(buildSubmitDeps({ now: () => testClock.now() }), {
          selectedTopicIds: [TOPIC.id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: DATE_RANGE_START,
          dateRangeEnd: DATE_RANGE_END,
          organizerTimezone: "UTC",
        });
        expect(result.ok).toBe(true);
        if (!result.ok || !result.search.id) {
          throw new Error("submitSearch did not produce a stored search id");
        }
        const searchId = result.search.id;

        const originalSnapshot = await loadSnapshotJson(searchId);

        testClock.advance(25 * 60 * 60 * 1000);

        const history = await getSearchRepository().listSearchHistory(
          { now: () => testClock.now() },
        );
        expect(history.length).toBeGreaterThan(0);
        const historyItem = history.find((item) => item.id === searchId);
        expect(historyItem).toBeDefined();
        expect(historyItem!.stale).toBe(true);

        const reopenedSnapshot = await loadSnapshotJson(searchId);
        expect(reopenedSnapshot).toEqual(originalSnapshot);
      },
    );
  },
);
