import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";

import { GET } from "../../app/api/v1/searches/[id]/route";
import { sealSessionCookie } from "../../src/auth/session";
import {
  availabilityWindows,
  discoverabilityConsents,
  sessions,
  userTopics,
  users,
} from "../../src/db/schema";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { submitSearch } from "../../src/search/search-input";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { getProfileByUserId } from "../../src/profile/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";
import type { SearchSnapshot } from "../../src/search/search-result-repository";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[1];
const MATCH_USER_1 = USER_FIXTURES[0];
const MATCH_USER_2_ID = "00000000-0000-0000-0000-0000000000d1";
const TOPIC = TOPIC_FIXTURES[0];

const DATE_RANGE_START = new Date("2026-07-13T12:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T18:00:00.000Z");
const DURATION_MINUTES = 60;

const FORBIDDEN_PATTERNS = [
  /title/i,
  /attendee/i,
  /location/i,
  /description/i,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
];

type SnapshotRow = {
  snapshot_json: unknown;
};

type SnapshotResponseBody = {
  id: string;
  organizerId: string;
  snapshot: unknown;
};

describe("E2E: Search snapshot does not expose raw calendar events or email addresses", () => {
  const TEST_DB_URL = inject("testDbUrl");

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
  });

  async function seedSecondMatchUser(): Promise<void> {
    const db = getTestDb();
    if (!db) {
      throw new Error("test db not initialized");
    }
    const now = new Date(FIXTURE_DATE);
    await db.insert(users).values({
      id: MATCH_USER_2_ID,
      email: "match-user-2-privacy@example.com",
      displayName: "Match User Two",
      role: "user",
      status: "active",
      profileTimezone: "UTC",
      bufferMinutes: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(availabilityWindows).values({
      id: "00000000-0000-0000-0000-000000000100",
      userId: MATCH_USER_2_ID,
      dayOfWeek: 1,
      startTime: "00:00",
      endTime: "23:59",
      profileTimezone: "UTC",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userTopics).values({
      id: "00000000-0000-0000-0000-000000000101",
      userId: MATCH_USER_2_ID,
      topicId: TOPIC.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(discoverabilityConsents).values({
      userId: MATCH_USER_2_ID,
      grantedAt: now,
    });
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

  async function insertSession(
    db: NonNullable<ReturnType<typeof getTestDb>>,
    sessionId: string,
    userId: string,
    csrfToken: string,
    now: Date,
  ): Promise<void> {
    await db.insert(sessions).values({
      id: sessionId,
      userId,
      csrfToken,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      createdAt: now,
    });
  }

  async function runSearch(): Promise<string> {
    const result = await submitSearch(
      {
        organizerId: ORGANIZER.id,
        activeTopicsRepository: {
          listActive() {
            return Promise.resolve([
              {
                id: TOPIC.id,
                name: TOPIC.name,
                status: "active" as const,
              },
            ]);
          },
        },
        profileRepository: {
          async findByUserId(userId: string) {
            return getProfileByUserId(userId);
          },
        },
        clock: { now: getTestClock() },
        matchingPoolSize: 10,
        discoverableUserRepository: createPostgresDiscoverableUserRepository(),
        searchResultRepository: createPostgresSearchResultRepository(),
      },
      {
        selectedTopicIds: [TOPIC.id],
        minimumMatchingUsers: 2,
        durationMinutes: DURATION_MINUTES,
        dateRangeStart: DATE_RANGE_START,
        dateRangeEnd: DATE_RANGE_END,
        organizerTimezone: "UTC",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || !result.search.id) {
      throw new Error("submitSearch did not produce a stored search id");
    }
    return result.search.id;
  }

  async function fetchSnapshotApi(
    searchId: string,
    cookie: string,
  ): Promise<SnapshotResponseBody> {
    const response = await GET(
      new Request(`http://localhost/api/v1/searches/${searchId}`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: searchId }) },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as SnapshotResponseBody;
  }

  async function loadPersistedSnapshotJson(
    searchId: string,
  ): Promise<unknown> {
    const db = getTestDb();
    if (!db) {
      throw new Error("test db not initialized");
    }
    const result = await db.execute<SnapshotRow>(
      `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`no search_results row for search_id ${searchId}`);
    }
    return row.snapshot_json;
  }

  function assertNoForbiddenFields(snapshot: unknown): void {
    const json = JSON.stringify(snapshot);
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(json).not.toMatch(pattern);
    }
  }

  const SLOT_MATCH_DETAIL_FIELDS = [
    "userId",
    "displayName",
    "avatarUrl",
    "shortBio",
    "topics",
    "topicProfile",
    "availabilityIndicator",
    "calendarFreshness",
  ] as const;

  function assertExpectedStructure(snapshot: SearchSnapshot): void {
    expect(snapshot.generatedAt).toBeDefined();
    expect(typeof snapshot.generatedAt).toBe("string");
    expect(snapshot.organizerTimezone).toBe("UTC");
    expect(snapshot.durationMinutes).toBe(DURATION_MINUTES);
    expect(snapshot.dateRangeStart).toBe(DATE_RANGE_START.toISOString());
    expect(snapshot.dateRangeEnd).toBe(DATE_RANGE_END.toISOString());
    expect(Array.isArray(snapshot.slots)).toBe(true);
    expect(snapshot.slots.length).toBeGreaterThan(0);
    for (const slot of snapshot.slots) {
      expect(slot.startUtc).toBeDefined();
      expect(typeof slot.startUtc).toBe("string");
      expect(slot.matchCount).toBeGreaterThan(0);
      expect(Array.isArray(slot.matches)).toBe(true);
      expect(slot.matches.length).toBeGreaterThan(0);
      for (const match of slot.matches) {
        const actualFields = Object.keys(match);
        expect(actualFields).toEqual(SLOT_MATCH_DETAIL_FIELDS);
        expect(typeof match.userId).toBe("string");
        expect(
          typeof match.displayName === "string" || match.displayName === null,
        ).toBe(true);
        expect(match.avatarUrl).toBeNull();
        expect(match.shortBio).toBeNull();
        expect(Array.isArray(match.topics)).toBe(true);
        expect(Array.isArray(match.topicProfile)).toBe(true);
        for (const topic of match.topics) {
          expect(typeof topic.id).toBe("string");
          expect(typeof topic.name).toBe("string");
        }
        for (const topic of match.topicProfile) {
          expect(typeof topic.id).toBe("string");
          expect(typeof topic.name).toBe("string");
        }
        expect(match.availabilityIndicator).toMatch(
          /^(available|partial|unavailable)$/,
        );
        expect(match.calendarFreshness).toMatch(/^(fresh|stale|none)$/);
      }
    }
  }

  it.runIf(HAS_TEST_DB)(
    "snapshot JSON returned via API contains no PII or calendar raw data",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = getTestClock()();

      await insertSession(
        db,
        "test-session-privacy",
        ORGANIZER.id,
        "csrf-privacy",
        now,
      );
      await grantDiscoverabilityConsent(MATCH_USER_1.id);
      await seedSecondMatchUser();
      const searchId = await runSearch();

      const cookie = await sealSessionCookie({
        sessionId: "test-session-privacy",
      });

      const body = await fetchSnapshotApi(searchId, cookie);

      assertNoForbiddenFields(body.snapshot);
      assertExpectedStructure(body.snapshot as SearchSnapshot);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "persisted snapshot JSON in database contains no PII or calendar raw data",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = getTestClock()();

      await insertSession(
        db,
        "test-session-privacy-db",
        ORGANIZER.id,
        "csrf-privacy-db",
        now,
      );
      await grantDiscoverabilityConsent(MATCH_USER_1.id);
      await seedSecondMatchUser();
      const searchId = await runSearch();

      const persistedJson = await loadPersistedSnapshotJson(searchId);

      assertNoForbiddenFields(persistedJson);
      assertExpectedStructure(persistedJson as SearchSnapshot);
    },
  );
});
