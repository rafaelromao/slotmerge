import { afterEach, describe, expect, inject, it } from "vitest";

import { createMatchingDependencies } from "../../src/matching";
import { getProfileByUserId } from "../../src/profile/repository";
import {
  availabilityWindows,
  discoverabilityConsents,
  userTopics,
  users,
} from "../../src/db/schema";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
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

function getLocalHourMinutes(date: Date, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

describe("E2E: Slot start times align to an hourly grid", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
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
      await db.insert(discoverabilityConsents).values({
        userId: MATCH_USER_ID,
        grantedAt: now,
      });
      await db.insert(userTopics).values({
        id: "00000000-0000-0000-0000-000000000230",
        userId: MATCH_USER_ID,
        topicId: SELECTED_TOPIC.id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(availabilityWindows).values({
        id: "00000000-0000-0000-0000-000000000220",
        userId: MATCH_USER_ID,
        dayOfWeek: 1,
        startTime: "00:00",
        endTime: "23:59",
        profileTimezone: "UTC",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(users).values({
        id: MATCH_USER_2_ID,
        email: MATCH_USER_2_EMAIL,
        displayName: MATCH_USER_2_DISPLAY_NAME,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(discoverabilityConsents).values({
        userId: MATCH_USER_2_ID,
        grantedAt: now,
      });
      await db.insert(userTopics).values({
        id: "00000000-0000-0000-0000-000000000231",
        userId: MATCH_USER_2_ID,
        topicId: SELECTED_TOPIC.id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(availabilityWindows).values({
        id: "00000000-0000-0000-0000-000000000221",
        userId: MATCH_USER_2_ID,
        dayOfWeek: 1,
        startTime: "00:00",
        endTime: "23:59",
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
        [MATCH_USER_2_ID]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

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
          discoverableUserRepository: createPostgresDiscoverableUserRepository(),
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
      const snapshot = await searchResultRepository.findBySearchId(result.search.id);
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
      await db.insert(discoverabilityConsents).values({
        userId: MATCH_USER_ID,
        grantedAt: now,
      });
      await db.insert(userTopics).values({
        id: "00000000-0000-0000-0000-000000000230",
        userId: MATCH_USER_ID,
        topicId: SELECTED_TOPIC.id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(availabilityWindows).values({
        id: "00000000-0000-0000-0000-000000000220",
        userId: MATCH_USER_ID,
        dayOfWeek: 1,
        startTime: "00:00",
        endTime: "23:59",
        profileTimezone: "UTC",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(users).values({
        id: MATCH_USER_2_ID,
        email: MATCH_USER_2_EMAIL,
        displayName: MATCH_USER_2_DISPLAY_NAME,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(discoverabilityConsents).values({
        userId: MATCH_USER_2_ID,
        grantedAt: now,
      });
      await db.insert(userTopics).values({
        id: "00000000-0000-0000-0000-000000000231",
        userId: MATCH_USER_2_ID,
        topicId: SELECTED_TOPIC.id,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(availabilityWindows).values({
        id: "00000000-0000-0000-0000-000000000221",
        userId: MATCH_USER_2_ID,
        dayOfWeek: 1,
        startTime: "00:00",
        endTime: "23:59",
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
        [MATCH_USER_2_ID]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const organizerTimezone = "America/Los_Angeles";

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
          discoverableUserRepository: createPostgresDiscoverableUserRepository(),
          searchResultRepository: createPostgresSearchResultRepository(),
        },
        {
          selectedTopicIds: [SELECTED_TOPIC.id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: new Date("2026-07-13T05:00:00.000Z"),
          dateRangeEnd: new Date("2026-07-13T12:00:00.000Z"),
          organizerTimezone,
        },
      );

      expect(result.ok, `AC2 failed: ${JSON.stringify(result)}`).toBe(true);
      if (!result.ok || !result.search.id) {
        throw new Error("expected Search submission to succeed");
      }

      const searchResultRepository = createPostgresSearchResultRepository();
      const snapshot = await searchResultRepository.findBySearchId(result.search.id);
      expect(snapshot).not.toBeNull();

      expect(snapshot!.snapshotJson).toMatchObject({
        organizerTimezone,
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
        const { minute } = getLocalHourMinutes(slotDate, organizerTimezone);
        expect(minute).toBe(0);
      }
    },
  );
});
