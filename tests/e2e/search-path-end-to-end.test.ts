import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eq } from "drizzle-orm";

import { GET } from "../../app/api/v1/searches/[id]/route";
import { SearchResultClient } from "../../app/searches/[id]/results/SearchResultClient";
import { sealSessionCookie } from "../../src/auth/session";
import {
  availabilityWindows,
  discoverabilityConsents,
  searchResults,
  sessions,
  userTopics,
  users,
} from "../../src/db/schema";
import { getProfileByUserId } from "../../src/profile/repository";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import {
  getSearchResultRepository,
  type SearchSnapshot,
} from "../../src/search/search-result-repository";
import { submitSearch } from "../../src/search/search-input";
import { listActiveTopics } from "../../src/topics/repository";
import { buildTestClock } from "../test-clock";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl");
const HAS_TEST_DB = TEST_DB_URL !== undefined;

const ORGANIZER = USER_FIXTURES[1];
const MATCH_USER = USER_FIXTURES[0];
const TOPIC = TOPIC_FIXTURES[0];

const SECOND_MATCH_USER_ID = "00000000-0000-0000-0000-0000000000d1";
const SECOND_MATCH_USER_TOPIC_ID = "00000000-0000-0000-0000-0000000000d2";
const SECOND_MATCH_USER_WINDOW_ID = "00000000-0000-0000-0000-0000000000d3";
const ORGANIZER_SESSION_ID = "00000000-0000-0000-0000-0000000000d4";

const DATE_RANGE_START = new Date("2026-07-13T12:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T18:00:00.000Z");
const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;
const ORGANIZER_TIMEZONE = "UTC";

const SNAPSHOT_KEYS = [
  "generatedAt",
  "organizerTimezone",
  "dateRangeStart",
  "dateRangeEnd",
  "durationMinutes",
  "slots",
] as const;
const SLOT_KEYS = ["startUtc", "matchCount", "matches"] as const;
const MATCH_KEYS = [
  "userId",
  "displayName",
  "avatarUrl",
  "shortBio",
  "topics",
  "topicProfile",
  "availabilityIndicator",
  "calendarFreshness",
] as const;
const TOPIC_KEYS = ["id", "name"] as const;

type SearchResponse = {
  id: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  organizerTimezone: string;
  generatedAt: string;
  snapshot: SearchSnapshot;
};

async function seedSecondMatchUser(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }

  const now = new Date(FIXTURE_DATE);
  await db.insert(users).values({
    id: SECOND_MATCH_USER_ID,
    email: "second-match@example.com",
    displayName: "Second Match User",
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(discoverabilityConsents).values({
    userId: SECOND_MATCH_USER_ID,
    grantedAt: now,
  });
  await db.insert(userTopics).values({
    id: SECOND_MATCH_USER_TOPIC_ID,
    userId: SECOND_MATCH_USER_ID,
    topicId: TOPIC.id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(availabilityWindows).values({
    id: SECOND_MATCH_USER_WINDOW_ID,
    userId: SECOND_MATCH_USER_ID,
    dayOfWeek: 1,
    startTime: "00:00",
    endTime: "23:59",
    profileTimezone: "UTC",
    createdAt: now,
    updatedAt: now,
  });
}

async function grantDiscoverabilityConsent(userId: string): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }

  await db.insert(discoverabilityConsents).values({
    userId,
    grantedAt: new Date(FIXTURE_DATE),
  });
}

function normalizeSnapshot(snapshot: SearchResponse["snapshot"]) {
  return {
    ...snapshot,
    slots: snapshot.slots.map((slot) => ({
      ...slot,
      matches: [...slot.matches].sort((a, b) =>
        a.userId.localeCompare(b.userId),
      ),
    })),
  };
}

describe("E2E: complete Search path", () => {
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

  it.runIf(HAS_TEST_DB)(
    "submits, assembles, persists, reads, and renders an authenticated Search Result",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = new Date(FIXTURE_DATE);
      await db.insert(sessions).values({
        id: ORGANIZER_SESSION_ID,
        userId: ORGANIZER.id,
        csrfToken: "csrf-search-path",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: now,
      });
      await grantDiscoverabilityConsent(MATCH_USER.id);
      await seedSecondMatchUser();

      const clock = buildTestClock(now);
      const submitResult = await submitSearch(
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
          clock,
          matchingPoolSize: 5,
          discoverableUserRepository: getDiscoverableUserRepository(),
          searchResultRepository: getSearchResultRepository(),
        },
        {
          selectedTopicIds: [TOPIC.id],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS,
          durationMinutes: DURATION_MINUTES,
          dateRangeStart: DATE_RANGE_START,
          dateRangeEnd: DATE_RANGE_END,
          organizerTimezone: ORGANIZER_TIMEZONE,
        },
      );

      expect(submitResult.ok).toBe(true);
      if (!submitResult.ok || !submitResult.search.id) {
        throw new Error("submitSearch did not produce a stored search id");
      }

      const searchId = submitResult.search.id;
      const cookie = await sealSessionCookie({
        sessionId: ORGANIZER_SESSION_ID,
      });
      const response = await GET(
        new Request(`http://localhost/api/v1/searches/${searchId}`, {
          headers: { cookie },
        }),
        { params: Promise.resolve({ id: searchId }) },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as SearchResponse;
      expect(Object.keys(body).sort()).toEqual(
        [
          "id",
          "organizerId",
          "selectedTopicIds",
          "minimumMatchingUsers",
          "durationMinutes",
          "dateRangeStart",
          "dateRangeEnd",
          "organizerTimezone",
          "generatedAt",
          "snapshot",
        ].sort(),
      );
      expect(body).toMatchObject({
        id: searchId,
        organizerId: ORGANIZER.id,
        selectedTopicIds: [TOPIC.id],
        minimumMatchingUsers: MINIMUM_MATCHING_USERS,
        durationMinutes: DURATION_MINUTES,
        dateRangeStart: DATE_RANGE_START.toISOString(),
        dateRangeEnd: DATE_RANGE_END.toISOString(),
        organizerTimezone: ORGANIZER_TIMEZONE,
        generatedAt: now.toISOString(),
      });

      expect(Object.keys(body.snapshot).sort()).toEqual(
        [...SNAPSHOT_KEYS].sort(),
      );
      expect(normalizeSnapshot(body.snapshot)).toEqual({
        generatedAt: now.toISOString(),
        organizerTimezone: ORGANIZER_TIMEZONE,
        dateRangeStart: DATE_RANGE_START.toISOString(),
        dateRangeEnd: DATE_RANGE_END.toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: [13, 14, 15, 16, 17].map((hour) => ({
          startUtc: `2026-07-13T${String(hour).padStart(2, "0")}:00:00.000Z`,
          matchCount: MINIMUM_MATCHING_USERS,
          matches: [
            {
              userId: MATCH_USER.id,
              displayName: MATCH_USER.displayName,
              avatarUrl: null,
              shortBio: null,
              topics: [{ id: TOPIC.id, name: TOPIC.name }],
              topicProfile: [
                { id: TOPIC.id, name: TOPIC.name },
                { id: TOPIC_FIXTURES[1].id, name: TOPIC_FIXTURES[1].name },
              ],
              availabilityIndicator: "available",
              calendarFreshness: "none",
            },
            {
              userId: SECOND_MATCH_USER_ID,
              displayName: "Second Match User",
              avatarUrl: null,
              shortBio: null,
              topics: [{ id: TOPIC.id, name: TOPIC.name }],
              topicProfile: [{ id: TOPIC.id, name: TOPIC.name }],
              availabilityIndicator: "available",
              calendarFreshness: "none",
            },
          ],
        })),
      });

      for (const slot of body.snapshot.slots) {
        expect(Object.keys(slot).sort()).toEqual([...SLOT_KEYS].sort());
        expect(slot.matchCount).toBe(slot.matches.length);
        expect(slot.startUtc).toMatch(
          /^2026-07-13T(?:13|14|15|16|17):00:00\.000Z$/,
        );
        for (const match of slot.matches) {
          expect(Object.keys(match).sort()).toEqual([...MATCH_KEYS].sort());
          for (const topic of [...match.topics, ...match.topicProfile]) {
            expect(Object.keys(topic).sort()).toEqual([...TOPIC_KEYS].sort());
          }
        }
      }
      expect(
        body.snapshot.slots.flatMap((slot) =>
          slot.matches.map((match) => match.userId),
        ),
      ).not.toContain(ORGANIZER.id);
      expect(JSON.stringify(body)).not.toMatch(
        /title|attendee|location|description|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
      );

      const persisted = await db
        .select({ snapshotJson: searchResults.snapshotJson })
        .from(searchResults)
        .where(eq(searchResults.searchId, searchId))
        .limit(1);
      expect(persisted[0]?.snapshotJson).toEqual(body.snapshot);

      const markup = renderToStaticMarkup(
        createElement(SearchResultClient, {
          snapshot: body.snapshot,
          organizerTimezone: ORGANIZER_TIMEZONE,
        }),
      );
      expect(markup).toContain("Search Result");
      expect(markup).toContain("UTC");
      expect(markup).toContain('class="calendar-grid"');
      expect(markup).toContain('class="calendar-slot"');
      expect(markup).toContain('class="slot-count">2</span>');
    },
  );
});
