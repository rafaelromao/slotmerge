import { afterEach, describe, expect, inject, it } from "vitest";

import { createMatchingDependencies } from "../../src/matching";
import { getProfileByUserId } from "../../src/profile/repository";
import {
  availabilityWindows,
  discoverabilityConsents,
  users,
  userTopics,
} from "../../src/db/schema";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import { submitSearch } from "../../src/search/search-input";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const ORGANIZER = USER_FIXTURES[2];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const LONG_USER_ID = "00000000-0000-0000-0000-000000000210";
const SHORT_USER_ID = "00000000-0000-0000-0000-000000000211";

const DATE_RANGE_START = new Date("2026-07-13T13:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T17:00:00.000Z");

const SHORT_DURATION_MINUTES = 30;
const LONG_DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;

function countSlotsAtMinimum(
  slots: ReadonlyArray<{ matchCount: number }>,
): number {
  return slots.filter((slot) => slot.matchCount >= MINIMUM_MATCHING_USERS).length;
}

async function submitSearchWithDuration(durationMinutes: number): Promise<string> {
  const result = await submitSearch(
    {
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
      clock: { now: getTestClock() },
      matchingPoolSize: 2,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: getDiscoverableUserRepository(),
      searchResultRepository: getSearchResultRepository(),
    },
    {
      selectedTopicIds: [SELECTED_TOPIC.id],
      minimumMatchingUsers: MINIMUM_MATCHING_USERS,
      durationMinutes,
      dateRangeStart: DATE_RANGE_START,
      dateRangeEnd: DATE_RANGE_END,
      organizerTimezone: "UTC",
    },
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("expected Search submission to succeed");
  }
  return result.search.id;
}

describe("E2E: Search duration is configurable per Search", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "shorter duration yields more slots at the minimum matching-user count than longer duration on the same grid",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = new Date(FIXTURE_DATE);
      await db.insert(users).values([
        {
          id: LONG_USER_ID,
          email: "long-window@example.com",
          displayName: "Long Window User",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: SHORT_USER_ID,
          email: "short-window@example.com",
          displayName: "Short Window User",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(discoverabilityConsents).values([
        { userId: LONG_USER_ID, grantedAt: now },
        { userId: SHORT_USER_ID, grantedAt: now },
      ]);
      await db.insert(userTopics).values([
        {
          id: "00000000-0000-0000-0000-000000000230",
          userId: LONG_USER_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000231",
          userId: SHORT_USER_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(availabilityWindows).values([
        {
          id: "00000000-0000-0000-0000-000000000220",
          userId: LONG_USER_ID,
          dayOfWeek: 1,
          startTime: "13:00",
          endTime: "17:00",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000221",
          userId: SHORT_USER_ID,
          dayOfWeek: 1,
          startTime: "14:00",
          endTime: "14:30",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      setSearchEligibilityProfileInputsForTests({
        [LONG_USER_ID]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
        [SHORT_USER_ID]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const searchResultRepository = getSearchResultRepository();

      const shortSearchId = await submitSearchWithDuration(
        SHORT_DURATION_MINUTES,
      );
      const longSearchId = await submitSearchWithDuration(
        LONG_DURATION_MINUTES,
      );

      const shortSnapshot = await searchResultRepository.findBySearchId(
        shortSearchId,
      );
      const longSnapshot = await searchResultRepository.findBySearchId(
        longSearchId,
      );

      expect(shortSnapshot).not.toBeNull();
      expect(longSnapshot).not.toBeNull();

      const shortSlots = countSlotsAtMinimum(
        shortSnapshot!.snapshotJson.slots,
      );
      const longSlots = countSlotsAtMinimum(
        longSnapshot!.snapshotJson.slots,
      );

      expect(shortSlots).toBeGreaterThan(longSlots);
      expect(shortSlots).toBe(1);
      expect(longSlots).toBe(0);

      expect(shortSnapshot!.snapshotJson.durationMinutes).toBe(
        SHORT_DURATION_MINUTES,
      );
      expect(longSnapshot!.snapshotJson.durationMinutes).toBe(
        LONG_DURATION_MINUTES,
      );
      expect(shortSnapshot!.snapshotJson.dateRangeStart).toBe(
        DATE_RANGE_START.toISOString(),
      );
      expect(longSnapshot!.snapshotJson.dateRangeStart).toBe(
        DATE_RANGE_START.toISOString(),
      );
      expect(shortSnapshot!.snapshotJson.dateRangeEnd).toBe(
        DATE_RANGE_END.toISOString(),
      );
      expect(longSnapshot!.snapshotJson.dateRangeEnd).toBe(
        DATE_RANGE_END.toISOString(),
      );
    },
  );
});
