import { afterEach, describe, expect, inject, it } from "vitest";

import { getProfileByUserId } from "../../src/profile/repository";
import {
  availabilityWindows,
  discoverabilityConsents,
  userTopics,
  users,
} from "../../src/db/schema";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { submitSearch } from "../../src/search/search-input";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const MATCH_USER_ID = "00000000-0000-0000-0000-000000000211";
const MATCH_USER_EMAIL = "match-user-211@example.com";
const MATCH_USER_DISPLAY_NAME = "Match User";
const MATCH_USER_2_ID = "00000000-0000-0000-0000-000000000212";
const MATCH_USER_2_EMAIL = "match-user-212@example.com";
const MATCH_USER_2_DISPLAY_NAME = "Match User 2";

const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;

function getLocalHourMinutes(
  date: Date,
  timezone: string,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

async function insertMatchUserFixtures(
  db: NonNullable<ReturnType<typeof getTestDb>>,
  dayOfWeek: number,
): Promise<void> {
  const now = new Date(FIXTURE_DATE);

  for (const [id, email, displayName, userTopicId, windowId] of [
    [
      MATCH_USER_ID,
      MATCH_USER_EMAIL,
      MATCH_USER_DISPLAY_NAME,
      "00000000-0000-0000-0000-000000000230",
      "00000000-0000-0000-0000-000000000220",
    ],
    [
      MATCH_USER_2_ID,
      MATCH_USER_2_EMAIL,
      MATCH_USER_2_DISPLAY_NAME,
      "00000000-0000-0000-0000-000000000231",
      "00000000-0000-0000-0000-000000000221",
    ],
  ] as const) {
    await db.insert(users).values({
      id,
      email,
      displayName,
      role: "user",
      status: "active",
      profileTimezone: "UTC",
      bufferMinutes: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(discoverabilityConsents).values({
      userId: id,
      grantedAt: now,
    });
    await db.insert(userTopics).values({
      id: userTopicId,
      userId: id,
      topicId: SELECTED_TOPIC.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(availabilityWindows).values({
      id: windowId,
      userId: id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:59",
      profileTimezone: "UTC",
      createdAt: now,
      updatedAt: now,
    });
  }

}

describe("E2E: Slot start times align to an hourly grid", () => {
  afterEach(() => {
  });

  it.runIf(HAS_TEST_DB)(
    "AC1: Slot start times are on the hour (UTC)",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertMatchUserFixtures(db, 1);

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
          discoverableUserRepository:
            createPostgresDiscoverableUserRepository(),
          searchResultRepository: createPostgresSearchResultRepository(),
        },
        {
          selectedTopicIds: [SELECTED_TOPIC.id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: new Date("2026-07-13T05:00:00.000Z"),
          dateRangeEnd: new Date("2026-07-13T12:00:00.000Z"),
          organizerTimezone: "UTC",
        },
      );

      expect(result.ok, `AC1 failed: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok || !result.search.id) {
        throw new Error("expected Search submission to succeed");
      }

      const searchResultRepository = createPostgresSearchResultRepository();
      const snapshot = await searchResultRepository.findBySearchId(
        result.search.id,
      );
      expect(snapshot).not.toBeNull();

      expect(snapshot!.snapshotJson).toMatchObject({
        organizerTimezone: "UTC",
        dateRangeStart: new Date("2026-07-13T05:00:00.000Z").toISOString(),
        dateRangeEnd: new Date("2026-07-13T12:00:00.000Z").toISOString(),
        durationMinutes: DURATION_MINUTES,
      });

      const slots = snapshot!.snapshotJson.slots;
      expect(slots.length).toBeGreaterThan(0);

      for (const slot of slots) {
        expect(typeof slot.startUtc).toBe("string");
        expect(new Date(slot.startUtc).getTime()).not.toBeNaN();
        expect(typeof slot.matchCount).toBe("number");
        expect(Array.isArray(slot.matches)).toBe(true);

        const slotDate = new Date(slot.startUtc);
        expect(slotDate.getUTCMinutes()).toBe(0);
        expect(slotDate.getUTCSeconds()).toBe(0);
        expect(slotDate.getUTCMilliseconds()).toBe(0);
      }
    },
  );

  it.runIf(HAS_TEST_DB)(
    "AC2: Times align to Organizer's selected timezone",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertMatchUserFixtures(db, 6);

      const organizerTimezone = "Australia/Lord_Howe";

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
          discoverableUserRepository:
            createPostgresDiscoverableUserRepository(),
          searchResultRepository: createPostgresSearchResultRepository(),
        },
        {
          selectedTopicIds: [SELECTED_TOPIC.id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: new Date("2026-10-03T13:00:00.000Z"),
          dateRangeEnd: new Date("2026-10-03T18:00:00.000Z"),
          organizerTimezone,
        },
      );

      expect(result.ok, `AC2 failed: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok || !result.search.id) {
        throw new Error("expected Search submission to succeed");
      }

      const searchResultRepository = createPostgresSearchResultRepository();
      const snapshot = await searchResultRepository.findBySearchId(
        result.search.id,
      );
      expect(snapshot).not.toBeNull();

      const slots = snapshot!.snapshotJson.slots;
      expect(slots.length).toBeGreaterThan(0);

      const expectedSlots = [
        "2026-10-03T13:30:00.000Z",
        "2026-10-03T14:30:00.000Z",
        "2026-10-03T16:00:00.000Z",
        "2026-10-03T17:00:00.000Z",
      ];

      expect(slots.length).toBe(expectedSlots.length);

      for (const slot of slots) {
        const { minute } = getLocalHourMinutes(
          new Date(slot.startUtc),
          organizerTimezone,
        );
        expect(minute).toBe(0);
      }

      expect(slots.map((s) => s.startUtc)).toEqual(expectedSlots);

      expect(snapshot!.snapshotJson).toEqual({
        generatedAt: snapshot!.snapshotJson.generatedAt,
        organizerTimezone,
        dateRangeStart: new Date("2026-10-03T13:00:00.000Z").toISOString(),
        dateRangeEnd: new Date("2026-10-03T18:00:00.000Z").toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: slots.map((slot) => ({
          startUtc: slot.startUtc,
          matchCount: slot.matchCount,
          matches: slot.matches,
        })),
      });
    },
  );
});
