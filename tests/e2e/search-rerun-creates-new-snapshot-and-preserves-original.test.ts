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

import {
  availabilityWindows,
  discoverabilityConsents,
  searchResults,
  searches,
  userTopics,
  users,
} from "../../src/db/schema";
import { createMatchingDependencies } from "../../src/matching";
import { getProfileByUserId } from "../../src/profile/repository";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { getSearchRepository } from "../../src/search/repository";
import { rerunSearch, submitSearch } from "../../src/search/search-input";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const ORGANIZER_A = USER_FIXTURES[1];

const MATCH_USER_ID = "00000000-0000-0000-0000-000000001121";
const MATCH_USER_TOPIC_ID = "00000000-0000-0000-0000-000000001122";
const MATCH_USER_AVAILABILITY_WINDOW_ID =
  "00000000-0000-0000-0000-000000001123";

const DATE_RANGE_START = new Date("2026-07-13T13:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T14:00:00.000Z");
const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;
const ORIGINAL_DISPLAY_NAME = "Match User Original Name";
const MUTATED_DISPLAY_NAME = "Match User Mutated Name";

async function seedMatchableUser(
  db: NonNullable<ReturnType<typeof getTestDb>>,
): Promise<void> {
  const now = new Date(FIXTURE_DATE);
  await db.insert(users).values({
    id: MATCH_USER_ID,
    email: "match-user-112@example.com",
    displayName: ORIGINAL_DISPLAY_NAME,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(discoverabilityConsents).values({
    userId: MATCH_USER_ID,
    grantedAt: now,
  });
  await db.insert(userTopics).values({
    id: MATCH_USER_TOPIC_ID,
    userId: MATCH_USER_ID,
    topicId: TOPIC_FIXTURES[0].id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(availabilityWindows).values({
    id: MATCH_USER_AVAILABILITY_WINDOW_ID,
    userId: MATCH_USER_ID,
    dayOfWeek: 1,
    startTime: "13:00",
    endTime: "14:00",
    profileTimezone: "UTC",
    createdAt: now,
    updatedAt: now,
  });
  setSearchEligibilityProfileInputsForTests({
    [MATCH_USER_ID]: {
      hasDisplayName: true,
      hasTopicOrProposal: true,
      hasAvailabilitySource: true,
      isActive: true,
    },
  });
}

type SubmitDeps = Parameters<typeof submitSearch>[0];

function buildSubmitDeps(): SubmitDeps {
  return {
    organizerId: ORGANIZER_A.id,
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
    clock: { now: getTestClock() },
    matchingPoolSize: 5,
    matchingDependencies: createMatchingDependencies(),
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  };
}

function buildRerunDeps(): Parameters<typeof rerunSearch>[1] {
  return {
    matchingDependencies: createMatchingDependencies(),
    discoverableUserRepository: getDiscoverableUserRepository(),
    clock: { now: getTestClock() },
    searchResultRepository: getSearchResultRepository(),
    topicRepository: {
      async listActive() {
        return (await listActiveTopics()).map(({ id, name }) => ({
          id,
          name,
          status: "active" as const,
        }));
      },
    },
    profileRepository: { findByUserId: getProfileByUserId },
  };
}

describe(
  "E2E: re-run a Search creates a new snapshot and preserves the original",
  () => {
    beforeAll(() => {
      if (TEST_DB_URL) {
        process.env.DATABASE_URL = TEST_DB_URL;
      }
      process.env.SESSION_SECRET = "test-session-secret-70-characters-long";
    });

    afterAll(() => {
      if (TEST_DB_URL) {
        delete process.env.DATABASE_URL;
      }
      delete process.env.SESSION_SECRET;
    });

    afterEach(() => {
      setSearchEligibilityProfileInputsForTests(null);
    });

    it.runIf(HAS_TEST_DB)(
      "re-run creates a new Search Result row and leaves the original snapshot untouched",
      async () => {
        await setupTest();
        const db = getTestDb();
        if (!db) {
          throw new Error("test db not initialized");
        }

        await seedMatchableUser(db);

        const initial = await submitSearch(buildSubmitDeps(), {
          selectedTopicIds: [TOPIC_FIXTURES[0].id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: DATE_RANGE_START,
          dateRangeEnd: DATE_RANGE_END,
          organizerTimezone: "UTC",
        });
        expect(initial.ok).toBe(true);
        if (!initial.ok || !initial.search.id) {
          throw new Error("expected initial submitSearch to succeed");
        }
        const originalSearchId = initial.search.id;

        const allSearchesBefore = await db.select().from(searches);
        expect(allSearchesBefore.length).toBe(1);
        const allResultRowsBefore = await db.select().from(searchResults);
        expect(allResultRowsBefore.length).toBe(1);

        const originalSearchResultRow =
          await getSearchResultRepository().findBySearchId(originalSearchId);
        expect(originalSearchResultRow).not.toBeNull();
        const originalSnapshotJson = originalSearchResultRow!.snapshotJson;
        const originalSearchResultId = originalSearchResultRow!.id;
        const originalSearchResultCreatedAt =
          originalSearchResultRow!.createdAt;
        expect(originalSnapshotJson).toMatchObject({
          organizerTimezone: "UTC",
          dateRangeStart: DATE_RANGE_START.toISOString(),
          dateRangeEnd: DATE_RANGE_END.toISOString(),
          durationMinutes: DURATION_MINUTES,
        });

        await db
          .update(users)
          .set({ displayName: MUTATED_DISPLAY_NAME })
          .where(eq(users.id, MATCH_USER_ID));

        const rerun = await rerunSearch(originalSearchId, buildRerunDeps());
        expect(rerun.ok).toBe(true);
        if (!rerun.ok || !rerun.search.id) {
          throw new Error("expected rerunSearch to succeed");
        }
        const newSearchId = rerun.search.id;
        expect(newSearchId).not.toBe(originalSearchId);

        const allSearches = await db.select().from(searches);
        expect(allSearches.length).toBe(2);
        const allSearchIds = allSearches.map((s) => s.id).sort();
        expect(allSearchIds).toEqual([originalSearchId, newSearchId].sort());

        const originalSearchStillExists = await getSearchRepository().findById(
          originalSearchId,
        );
        expect(originalSearchStillExists).not.toBeNull();
        expect(originalSearchStillExists!.id).toBe(originalSearchId);
        expect(originalSearchStillExists!.generatedAt.toISOString()).toBe(
          initial.search.generatedAt.toISOString(),
        );
        expect(originalSearchStillExists!.selectedTopicIds).toEqual(
          initial.search.selectedTopicIds,
        );
        expect(originalSearchStillExists!.minimumMatchingUsers).toBe(
          MINIMUM_MATCHING_USERS,
        );
        expect(originalSearchStillExists!.durationMinutes).toBe(DURATION_MINUTES);
        expect(originalSearchStillExists!.dateRangeStart.toISOString()).toBe(
          DATE_RANGE_START.toISOString(),
        );
        expect(originalSearchStillExists!.dateRangeEnd.toISOString()).toBe(
          DATE_RANGE_END.toISOString(),
        );
        expect(originalSearchStillExists!.organizerTimezone).toBe("UTC");

        const newSearchRecord = await getSearchRepository().findById(newSearchId);
        expect(newSearchRecord).not.toBeNull();
        expect(newSearchRecord!.id).toBe(newSearchId);
        expect(newSearchRecord!.organizerId).toBe(ORGANIZER_A.id);
        expect(newSearchRecord!.selectedTopicIds).toEqual(
          initial.search.selectedTopicIds,
        );
        expect(newSearchRecord!.minimumMatchingUsers).toBe(MINIMUM_MATCHING_USERS);
        expect(newSearchRecord!.durationMinutes).toBe(DURATION_MINUTES);
        expect(newSearchRecord!.dateRangeStart.toISOString()).toBe(
          DATE_RANGE_START.toISOString(),
        );
        expect(newSearchRecord!.dateRangeEnd.toISOString()).toBe(
          DATE_RANGE_END.toISOString(),
        );
        expect(newSearchRecord!.organizerTimezone).toBe("UTC");
        expect(newSearchRecord!.generatedAt.getTime()).toBeGreaterThan(
          initial.search.generatedAt.getTime(),
        );

        const allResultRows = await db.select().from(searchResults);
        expect(allResultRows.length).toBe(2);
        const resultRowBySearchId = new Map(
          allResultRows.map((row) => [row.searchId, row]),
        );
        expect(resultRowBySearchId.has(originalSearchId)).toBe(true);
        expect(resultRowBySearchId.has(newSearchId)).toBe(true);

        const originalResultAfterRerun =
          resultRowBySearchId.get(originalSearchId)!;
        expect(originalResultAfterRerun.id).toBe(originalSearchResultId);
        expect(originalResultAfterRerun.createdAt.toISOString()).toBe(
          originalSearchResultCreatedAt.toISOString(),
        );
        expect(originalResultAfterRerun.snapshotJson).toEqual(originalSnapshotJson);

        const originalSnapshotViaRepository =
          await getSearchResultRepository().findBySearchId(originalSearchId);
        expect(originalSnapshotViaRepository).not.toBeNull();
        expect(originalSnapshotViaRepository!.id).toBe(originalSearchResultId);
        expect(originalSnapshotViaRepository!.snapshotJson).toEqual(
          originalSnapshotJson,
        );

        const newResultAfterRerun = resultRowBySearchId.get(newSearchId)!;
        expect(newResultAfterRerun.id).not.toBe(originalSearchResultId);
        expect(newResultAfterRerun.searchId).toBe(newSearchId);
        expect(newResultAfterRerun.createdAt.getTime()).toBeGreaterThanOrEqual(
          originalSearchResultCreatedAt.getTime(),
        );
        expect(newResultAfterRerun.snapshotJson).toMatchObject({
          organizerTimezone: "UTC",
          dateRangeStart: DATE_RANGE_START.toISOString(),
          dateRangeEnd: DATE_RANGE_END.toISOString(),
          durationMinutes: DURATION_MINUTES,
        });

        const originalSnapshotDisplayNames = (
          originalSnapshotJson.slots as Array<{
            matches: Array<{ displayName: string | null }>;
          }>
        ).flatMap((slot) => slot.matches.map((m) => m.displayName));
        expect(originalSnapshotDisplayNames).toContain(ORIGINAL_DISPLAY_NAME);
        expect(originalSnapshotDisplayNames).not.toContain(MUTATED_DISPLAY_NAME);

        const newSlots = newResultAfterRerun.snapshotJson.slots;
        const flatMatches = newSlots.flatMap((slot) => slot.matches);
        const mutatedMatch = flatMatches.find(
          (match) => match.userId === MATCH_USER_ID,
        );
        expect(mutatedMatch?.displayName).toBe(MUTATED_DISPLAY_NAME);

        const history = await getSearchRepository().listSearchHistory();
        expect(history.length).toBe(2);
        const historyById = new Map(history.map((item) => [item.id, item]));
        const originalHistoryItem = historyById.get(originalSearchId);
        const newHistoryItem = historyById.get(newSearchId);
        expect(originalHistoryItem).toBeDefined();
        expect(newHistoryItem).toBeDefined();
        expect(originalHistoryItem!.snapshotId).toBe(originalSearchResultId);
        expect(newHistoryItem!.snapshotId).not.toBe(originalSearchResultId);
        expect(newHistoryItem!.snapshotId).toBe(newResultAfterRerun.id);
        expect(originalHistoryItem!.generatedAt.toISOString()).toBe(
          initial.search.generatedAt.toISOString(),
        );
        expect(newHistoryItem!.generatedAt.toISOString()).toBe(
          newSearchRecord!.generatedAt.toISOString(),
        );
        expect(newHistoryItem!.generatedAt.getTime()).toBeGreaterThan(
          originalHistoryItem!.generatedAt.getTime(),
        );
      },
    );
  },
);
