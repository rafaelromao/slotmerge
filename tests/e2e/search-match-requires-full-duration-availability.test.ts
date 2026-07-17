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
import { getTestClock, getTestDb } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const ORGANIZER = USER_FIXTURES[1];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];
const FULL_DURATION_USER_ID = "00000000-0000-0000-0000-000000000110";
const PARTIAL_OVERLAP_USER_ID = "00000000-0000-0000-0000-000000000111";
const SLOT_START = new Date("2026-07-13T13:00:00.000Z");
const SLOT_END = new Date("2026-07-13T14:00:00.000Z");
const DURATION_MINUTES = 60;

describe("E2E: Match requires full-duration Availability", () => {
  afterEach(() => {
  });

  it.runIf(HAS_TEST_DB)(
    "counts a full-duration User and excludes a partial-overlap User",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      const now = new Date(FIXTURE_DATE);
      await db.insert(users).values([
        {
          id: FULL_DURATION_USER_ID,
          email: "full-duration@example.com",
          displayName: "Full Duration User",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: PARTIAL_OVERLAP_USER_ID,
          email: "partial-overlap@example.com",
          displayName: "Partial Overlap User",
          role: "user",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(discoverabilityConsents).values([
        { userId: FULL_DURATION_USER_ID, grantedAt: now },
        { userId: PARTIAL_OVERLAP_USER_ID, grantedAt: now },
      ]);
      await db.insert(userTopics).values([
        {
          id: "00000000-0000-0000-0000-000000000130",
          userId: FULL_DURATION_USER_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000131",
          userId: PARTIAL_OVERLAP_USER_ID,
          topicId: SELECTED_TOPIC.id,
          status: "active",
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await db.insert(availabilityWindows).values([
        {
          id: "00000000-0000-0000-0000-000000000120",
          userId: FULL_DURATION_USER_ID,
          dayOfWeek: 1,
          startTime: "13:00",
          endTime: "14:00",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "00000000-0000-0000-0000-000000000121",
          userId: PARTIAL_OVERLAP_USER_ID,
          dayOfWeek: 1,
          startTime: "13:00",
          endTime: "13:30",
          profileTimezone: "UTC",
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const searchResultRepository = getSearchResultRepository();
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
          discoverableUserRepository: getDiscoverableUserRepository(),
          searchResultRepository,
        },
        {
          selectedTopicIds: [SELECTED_TOPIC.id],
          minimumMatchingUsers: 2,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: SLOT_START,
          dateRangeEnd: SLOT_END,
          organizerTimezone: "UTC",
        },
      );

      expect(result.ok).toBe(true);
      if (!result.ok || !result.search.id) {
        throw new Error("expected Search submission to succeed");
      }

      const persisted = await searchResultRepository.findBySearchId(
        result.search.id,
      );

      expect(persisted).not.toBeNull();
      expect(persisted?.snapshotJson).toEqual({
        generatedAt: "2026-07-12T12:00:00.001Z",
        organizerTimezone: "UTC",
        dateRangeStart: SLOT_START.toISOString(),
        dateRangeEnd: SLOT_END.toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: [
          {
            startUtc: SLOT_START.toISOString(),
            matchCount: 1,
            matches: [
              {
                userId: FULL_DURATION_USER_ID,
                displayName: "Full Duration User",
                avatarUrl: null,
                shortBio: null,
                topics: [{ id: SELECTED_TOPIC.id, name: SELECTED_TOPIC.name }],
                topicProfile: [
                  { id: SELECTED_TOPIC.id, name: SELECTED_TOPIC.name },
                ],
                availabilityIndicator: "available",
                calendarFreshness: "none",
              },
            ],
          },
        ],
      });
    },
  );
});
