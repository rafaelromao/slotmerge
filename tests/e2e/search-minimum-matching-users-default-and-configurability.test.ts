import { afterEach, describe, expect, inject, it } from "vitest";

import { getProfileByUserId } from "../../src/profile/repository";
import {
  availabilityWindows,
  discoverabilityConsents,
  users,
  userTopics,
} from "../../src/db/schema";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import { submitSearch } from "../../src/search/search-input";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const ORGANIZER = USER_FIXTURES[2];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const USER_A_ID = "00000000-0000-0000-0000-000000000210";
const USER_B_ID = "00000000-0000-0000-0000-000000000211";
const USER_C_ID = "00000000-0000-0000-0000-000000000212";

const DATE_RANGE_START = new Date("2026-07-13T13:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T17:00:00.000Z");

async function submitSearchWithMinimum(
  minimumMatchingUsers: number,
): Promise<string> {
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
      matchingPoolSize: 3,
      discoverableUserRepository: getDiscoverableUserRepository(),
      searchResultRepository: getSearchResultRepository(),
    },
    {
      selectedTopicIds: [SELECTED_TOPIC.id],
      minimumMatchingUsers,
      durationMinutes: 60,
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

function countSlotsAtMinimum(
  slots: ReadonlyArray<{ matchCount: number }>,
  minimum: number,
): number {
  return slots.filter((slot) => slot.matchCount >= minimum).length;
}

describe("E2E: Minimum matching Users default and configurability", () => {
  afterEach(() => {
  });

  it.runIf(HAS_TEST_DB)(
    "AC1: default minimum matching users is 2",
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
          id: USER_A_ID,
          email: "user-a@example.com",
          displayName: "User A",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(discoverabilityConsents).values([
        { userId: USER_A_ID, grantedAt: now },
      ]);
      await db.insert(userTopics).values([
        {
          id: "00000000-0000-0000-0000-000000000230",
          userId: USER_A_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(availabilityWindows).values([
        {
          id: "00000000-0000-0000-0000-000000000220",
          userId: USER_A_ID,
          dayOfWeek: 1,
          startTime: "13:00",
          endTime: "17:00",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
      ]);

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
          matchingPoolSize: 3,
          discoverableUserRepository: getDiscoverableUserRepository(),
          searchResultRepository: getSearchResultRepository(),
        },
        {
          selectedTopicIds: [SELECTED_TOPIC.id],
          durationMinutes: 60,
          dateRangeStart: DATE_RANGE_START,
          dateRangeEnd: DATE_RANGE_END,
          organizerTimezone: "UTC",
        },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("expected Search submission to succeed");
      }
      expect(result.search.minimumMatchingUsers).toBe(2);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "AC2: override to 3 narrows the result set compared to default 2",
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
          id: USER_A_ID,
          email: "user-a@example.com",
          displayName: "User A",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: USER_B_ID,
          email: "user-b@example.com",
          displayName: "User B",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: USER_C_ID,
          email: "user-c@example.com",
          displayName: "User C",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(discoverabilityConsents).values([
        { userId: USER_A_ID, grantedAt: now },
        { userId: USER_B_ID, grantedAt: now },
        { userId: USER_C_ID, grantedAt: now },
      ]);
      await db.insert(userTopics).values([
        {
          id: "00000000-0000-0000-0000-000000000230",
          userId: USER_A_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000231",
          userId: USER_B_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000232",
          userId: USER_C_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(availabilityWindows).values([
        {
          id: "00000000-0000-0000-0000-000000000220",
          userId: USER_A_ID,
          dayOfWeek: 1,
          startTime: "13:00",
          endTime: "17:00",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000221",
          userId: USER_B_ID,
          dayOfWeek: 1,
          startTime: "14:00",
          endTime: "15:00",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000222",
          userId: USER_C_ID,
          dayOfWeek: 1,
          startTime: "15:00",
          endTime: "16:00",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const searchResultRepository = getSearchResultRepository();

      const min2SearchId = await submitSearchWithMinimum(2);
      const min3SearchId = await submitSearchWithMinimum(3);

      const min2Snapshot = await searchResultRepository.findBySearchId(
        min2SearchId,
      );
      const min3Snapshot = await searchResultRepository.findBySearchId(
        min3SearchId,
      );

      expect(min2Snapshot).not.toBeNull();
      expect(min3Snapshot).not.toBeNull();

      const min2Slots = countSlotsAtMinimum(
        min2Snapshot!.snapshotJson.slots,
        2,
      );
      const min3Slots = countSlotsAtMinimum(
        min3Snapshot!.snapshotJson.slots,
        3,
      );

      expect(min2Slots).toBeGreaterThan(min3Slots);
      expect(min3Slots).toBe(0);

      expect(min2Snapshot!.snapshotJson.slots.length).toBeGreaterThan(0);
      expect(min3Snapshot!.snapshotJson.slots.length).toBeLessThan(
        min2Snapshot!.snapshotJson.slots.length,
      );
    },
  );
});
