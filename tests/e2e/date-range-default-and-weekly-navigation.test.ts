import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createMatchingDependencies } from "../../src/matching";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import {
  getNextWeekStart,
  getPreviousWeekStart,
} from "../../src/search/calendar-utils";
import { getSearchRepository } from "../../src/search/repository";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import {
  submitSearch,
  startOfWeekInTimezone,
  type ProfileRepository,
} from "../../src/search/search-input";
import { getProfileByUserId } from "../../src/profile/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, setupTest } from "../helpers/setup";
import type { Clock } from "../../src/system/clock";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;
const ORGANIZER = USER_FIXTURES[1];
const ORGANIZER_TIMEZONE = ORGANIZER.profileTimezone;
const FIXTURE_TODAY = new Date(FIXTURE_DATE);
const FIVE_WEEKS_MS = 5 * 7 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

class DbBackedProfileRepository implements ProfileRepository {
  findByUserId(userId: string): ReturnType<typeof getProfileByUserId> {
    return getProfileByUserId(userId);
  }
}

function fixedClockAtFixtureDate(): Clock {
  return { now: () => new Date(getTestClock()()) };
}

async function submitDefaultSearch(clock: Clock) {
  return submitSearch(
    {
      organizerId: ORGANIZER.id,
      activeTopicsRepository: {
        listActive: () =>
          Promise.resolve([
            {
              id: TOPIC_FIXTURES[0].id,
              name: TOPIC_FIXTURES[0].name,
              status: "active" as const,
            },
          ]),
      },
      profileRepository: new DbBackedProfileRepository(),
      clock,
      matchingPoolSize: 5,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: getDiscoverableUserRepository(),
      searchResultRepository: getSearchResultRepository(),
    },
    {
      selectedTopicIds: [TOPIC_FIXTURES[0].id],
      durationMinutes: 60,
    },
  );
}

describe("E2E: date range default and weekly navigation inside 90-day window", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
  });

  it.runIf(HAS_TEST_DB)(
    "submitting a search with no date overrides persists a Search whose default range is the current week plus next four weeks inside the rolling 90-day window",
    async () => {
      await setupTest();

      const result = await submitDefaultSearch(fixedClockAtFixtureDate());

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("expected submitSearch to succeed");
      }

      const expectedStart = startOfWeekInTimezone(
        FIXTURE_TODAY,
        ORGANIZER_TIMEZONE,
      );
      const expectedEnd = new Date(expectedStart.getTime() + FIVE_WEEKS_MS);

      expect(result.search.dateRangeStart.toISOString()).toBe(
        expectedStart.toISOString(),
      );
      expect(result.search.dateRangeEnd.toISOString()).toBe(
        expectedEnd.toISOString(),
      );
      expect(
        result.search.dateRangeEnd.getTime() -
          result.search.dateRangeStart.getTime(),
      ).toBe(FIVE_WEEKS_MS);

      const windowEnd = new Date(FIXTURE_TODAY.getTime() + NINETY_DAYS_MS);
      expect(result.search.dateRangeEnd.getTime()).toBeLessThanOrEqual(
        windowEnd.getTime(),
      );
      expect(result.search.dateRangeStart.getTime()).toBeGreaterThanOrEqual(
        FIXTURE_TODAY.getTime() - NINETY_DAYS_MS,
      );

      const persisted = await getSearchRepository().findById(result.search.id!);
      expect(persisted).not.toBeNull();
      expect(persisted!.dateRangeStart.toISOString()).toBe(
        expectedStart.toISOString(),
      );
      expect(persisted!.dateRangeEnd.toISOString()).toBe(
        expectedEnd.toISOString(),
      );

      const snapshot = await getSearchResultRepository().findBySearchId(
        result.search.id!,
      );
      expect(snapshot).not.toBeNull();
      expect(snapshot!.snapshotJson).toMatchObject({
        dateRangeStart: expectedStart.toISOString(),
        dateRangeEnd: expectedEnd.toISOString(),
        organizerTimezone: ORGANIZER_TIMEZONE,
        durationMinutes: 60,
      });
      expect(Array.isArray(snapshot!.snapshotJson.slots)).toBe(true);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "weekly navigation backward from the persisted default dateRangeStart stays inside the rolling 90-day window",
    async () => {
      await setupTest();

      const result = await submitDefaultSearch(fixedClockAtFixtureDate());
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("expected submitSearch to succeed");
      }
      const search = await getSearchRepository().findById(result.search.id!);
      expect(search).not.toBeNull();

      const prev = getPreviousWeekStart(search!.dateRangeStart, FIXTURE_TODAY);
      expect(prev).not.toBeNull();
      expect(prev!.getTime()).toBe(
        search!.dateRangeStart.getTime() - 7 * 24 * 60 * 60 * 1000,
      );
      expect(prev!.getTime()).toBeGreaterThanOrEqual(
        FIXTURE_TODAY.getTime() - NINETY_DAYS_MS,
      );
    },
  );

  it.runIf(HAS_TEST_DB)(
    "weekly navigation backward is allowed at the 90-day boundary and returns null strictly outside it",
    async () => {
      await setupTest();

      const atBoundaryCurrent = new Date(
        FIXTURE_TODAY.getTime() - NINETY_DAYS_MS + 7 * 24 * 60 * 60 * 1000,
      );
      const atBoundaryPrev = getPreviousWeekStart(
        atBoundaryCurrent,
        FIXTURE_TODAY,
      );
      expect(atBoundaryPrev).not.toBeNull();
      expect(atBoundaryPrev!.getTime()).toBe(
        atBoundaryCurrent.getTime() - 7 * 24 * 60 * 60 * 1000,
      );

      const beyondBoundaryCurrent = new Date(
        FIXTURE_TODAY.getTime() - NINETY_DAYS_MS,
      );
      const beyondBoundaryPrev = getPreviousWeekStart(
        beyondBoundaryCurrent,
        FIXTURE_TODAY,
      );
      expect(beyondBoundaryPrev).toBeNull();

      const farBeyondCurrent = new Date(
        FIXTURE_TODAY.getTime() - 100 * 24 * 60 * 60 * 1000,
      );
      const farBeyondPrev = getPreviousWeekStart(
        farBeyondCurrent,
        FIXTURE_TODAY,
      );
      expect(farBeyondPrev).toBeNull();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "weekly navigation forward from the persisted default dateRangeStart stays inside the snapshot range and returns null at the end",
    async () => {
      await setupTest();

      const result = await submitDefaultSearch(fixedClockAtFixtureDate());
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("expected submitSearch to succeed");
      }
      const search = await getSearchRepository().findById(result.search.id!);
      expect(search).not.toBeNull();

      let cursor: Date | null = search!.dateRangeStart;
      let stepCount = 0;
      while (cursor !== null) {
        const next = getNextWeekStart(cursor, search!.dateRangeEnd);
        if (next === null) {
          break;
        }
        expect(next.getTime()).toBe(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
        expect(next.getTime()).toBeLessThan(search!.dateRangeEnd.getTime());
        cursor = next;
        stepCount += 1;
      }
      expect(stepCount).toBe(4);

      const lastWeekStart = new Date(
        search!.dateRangeStart.getTime() + 4 * 7 * 24 * 60 * 60 * 1000,
      );
      const afterLastWeek = getNextWeekStart(
        lastWeekStart,
        search!.dateRangeEnd,
      );
      expect(afterLastWeek).toBeNull();
    },
  );
});
