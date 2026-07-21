import { describe, expect, inject, it } from "vitest";

import { addWeeklyAvailabilityWindow } from "../../src/profile/availability-windows";
import {
  discoverabilityConsents,
  sessions,
  userTopics,
  users,
} from "../../src/db/schema";
import { getProfileByUserId } from "../../src/profile/repository";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { submitSearch } from "../../src/search/search-input";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[1];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const CANDIDATE_USER_ID = "00000000-0000-0000-0000-000000000085";
const CANDIDATE_USER_TOPIC_ID = "00000000-0000-0000-0000-000000000086";
const CANDIDATE_SESSION_ID = "00000000-0000-0000-0000-000000000087";

const SLOT_START = new Date("2026-07-13T13:00:00.000Z");
const DURATION_MINUTES = 60;
const SLOT_END = new Date(SLOT_START.getTime() + DURATION_MINUTES * 60_000);
const MINIMUM_MATCHING_USERS = 2;
const PROFILE_TIMEZONE = "UTC";
const WINDOW_DAY_OF_WEEK = SLOT_START.getUTCDay();
const WINDOW_START = `${String(SLOT_START.getUTCHours()).padStart(2, "0")}:${String(SLOT_START.getUTCMinutes()).padStart(2, "0")}`;
const WINDOW_END = `${String(SLOT_END.getUTCHours()).padStart(2, "0")}:${String(SLOT_END.getUTCMinutes()).padStart(2, "0")}`;

type SearchParams = Parameters<typeof submitSearch>[1];

function buildSearchParams(): SearchParams {
  return {
    selectedTopicIds: [SELECTED_TOPIC.id],
    minimumMatchingUsers: MINIMUM_MATCHING_USERS,
    durationMinutes: DURATION_MINUTES,
    dateRangeStart: SLOT_START,
    dateRangeEnd: SLOT_END,
    organizerTimezone: PROFILE_TIMEZONE,
  };
}

async function runSearch(): Promise<string> {
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
      matchingPoolSize: MINIMUM_MATCHING_USERS,
      discoverableUserRepository: getDiscoverableUserRepository(),
      searchResultRepository: getSearchResultRepository(),
    },
    buildSearchParams(),
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("expected Search submission to succeed");
  }
  return result.search.id;
}

describe("E2E: availability edits apply immediately to next Search", () => {
  it.runIf(HAS_TEST_DB)(
    "run Search, add a weekly Availability Window, run Search again with same parameters and the new Search returns slots matching the new window",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = new Date(FIXTURE_DATE);

      await db.insert(users).values({
        id: CANDIDATE_USER_ID,
        email: "availability-edit-candidate@example.com",
        displayName: "Availability Edit Candidate",
        role: "user",
        status: "active",
        profileTimezone: PROFILE_TIMEZONE,
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(discoverabilityConsents).values({
        userId: CANDIDATE_USER_ID,
        grantedAt: now,
      });
      await db.insert(userTopics).values({
        id: CANDIDATE_USER_TOPIC_ID,
        userId: CANDIDATE_USER_ID,
        topicId: SELECTED_TOPIC.id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(sessions).values({
        id: CANDIDATE_SESSION_ID,
        userId: CANDIDATE_USER_ID,
        csrfToken: "candidate-csrf-85",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: now,
      });

      const searchResultRepository = getSearchResultRepository();

      const firstSearchId = await runSearch();
      const firstPersisted =
        await searchResultRepository.findBySearchId(firstSearchId);
      expect(firstPersisted).not.toBeNull();
      expect(firstPersisted?.snapshotJson).toEqual({
        generatedAt: "2026-07-12T12:00:00.001Z",
        organizerTimezone: PROFILE_TIMEZONE,
        dateRangeStart: SLOT_START.toISOString(),
        dateRangeEnd: SLOT_END.toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: [
          {
            startUtc: SLOT_START.toISOString(),
            matchCount: 0,
            matches: [],
          },
        ],
      });

      const windowsBeforeEdit = await db.execute<{ count: string }>(
        `SELECT COUNT(*) as count FROM availability_windows WHERE user_id = '${CANDIDATE_USER_ID}'`,
      );
      expect(Number(windowsBeforeEdit.rows[0].count)).toBe(0);

      const window = await addWeeklyAvailabilityWindow(
        CANDIDATE_USER_ID,
        {
          dayOfWeek: WINDOW_DAY_OF_WEEK,
          startTime: WINDOW_START,
          endTime: WINDOW_END,
        },
        PROFILE_TIMEZONE,
      );

      expect(window.id).toBeTruthy();
      expect(window.dayOfWeek).toBe(WINDOW_DAY_OF_WEEK);
      expect(window.startTime).toBe(WINDOW_START);
      expect(window.endTime).toBe(WINDOW_END);
      expect(window.profileTimezone).toBe(PROFILE_TIMEZONE);

      const persistedRows = await db.execute<{
        id: string;
        day_of_week: number;
        start_time: string;
        end_time: string;
        profile_timezone: string;
      }>(
        `SELECT id, day_of_week, start_time, end_time, profile_timezone
         FROM availability_windows
         WHERE user_id = '${CANDIDATE_USER_ID}'`,
      );
      expect(persistedRows.rows).toHaveLength(1);
      const persistedRow = persistedRows.rows[0];
      expect(persistedRow.day_of_week).toBe(WINDOW_DAY_OF_WEEK);
      expect(persistedRow.start_time).toBe(WINDOW_START);
      expect(persistedRow.end_time).toBe(WINDOW_END);
      expect(persistedRow.profile_timezone).toBe(PROFILE_TIMEZONE);
      expect(persistedRow.id).toBe(window.id);

      const secondSearchId = await runSearch();
      expect(secondSearchId).not.toBe(firstSearchId);

      const secondPersisted =
        await searchResultRepository.findBySearchId(secondSearchId);
      expect(secondPersisted).not.toBeNull();
      expect(secondPersisted?.snapshotJson).toEqual({
        generatedAt: "2026-07-12T12:00:00.004Z",
        organizerTimezone: PROFILE_TIMEZONE,
        dateRangeStart: SLOT_START.toISOString(),
        dateRangeEnd: SLOT_END.toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: [
          {
            startUtc: SLOT_START.toISOString(),
            matchCount: 1,
            matches: [
              {
                userId: CANDIDATE_USER_ID,
                displayName: "Availability Edit Candidate",
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
