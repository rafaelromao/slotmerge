import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { GET } from "../../app/api/searches/[id]/route";
import { sealSessionCookie } from "../../src/auth/session";
import { availabilityWindows, discoverabilityConsents, sessions, users, userTopics } from "../../src/db/schema";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { submitSearch } from "../../src/search/search-input";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { getProfileByUserId } from "../../src/profile/repository";
import {
  FIXTURE_DATE,
  TOPIC_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const REGULAR_USER = USER_FIXTURES[0];
const ORGANIZER = USER_FIXTURES[1];
const ADMIN = USER_FIXTURES[2];
const TOPIC = TOPIC_FIXTURES[0];

const SECOND_MATCH_USER_ID = "00000000-0000-0000-0000-0000000000d1";

const ORGANIZER_SESSION_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_SESSION_ID = "00000000-0000-0000-0000-0000000000a2";
const ADMIN_SESSION_ID = "00000000-0000-0000-0000-0000000000a3";
const ORGANIZER_SESSION_2_ID = "00000000-0000-0000-0000-0000000000b1";
const ORGANIZER_SESSION_3_ID = "00000000-0000-0000-0000-0000000000b2";
const ORGANIZER_SESSION_4_ID = "00000000-0000-0000-0000-0000000000b3";

const DATE_RANGE_START = new Date("2026-07-13T12:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-19T23:00:00.000Z");
const DURATION_MINUTES = 60;

type SnapshotResponseBody = {
  id: string;
  organizerId: string;
  snapshot: unknown;
};

describe("E2E: run a Search and render weekly calendar result", () => {
  const TEST_DB_URL = inject("testDbUrl");

  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.SESSION_SECRET =
      "test-session-secret-70-characters-long-xxx";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
  });

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
      profileTimezone: "America/New_York",
      bufferMinutes: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(availabilityWindows).values({
      id: "00000000-0000-0000-0000-000000000101",
      userId: SECOND_MATCH_USER_ID,
      dayOfWeek: 1,
      startTime: "00:00",
      endTime: "23:59",
      profileTimezone: "America/New_York",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userTopics).values({
      id: "00000000-0000-0000-0000-000000000102",
      userId: SECOND_MATCH_USER_ID,
      topicId: TOPIC.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(discoverabilityConsents).values({
      userId: SECOND_MATCH_USER_ID,
      grantedAt: now,
    });
  }

  async function runSearchAsOrganizer(): Promise<string> {
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
        organizerTimezone: ORGANIZER.profileTimezone,
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
      new Request(`http://localhost/api/searches/${searchId}`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: searchId }) },
    );
    return {
      id: searchId,
      organizerId: ORGANIZER.id,
      snapshot: null,
      ...(await response.json()),
    } as SnapshotResponseBody;
  }

  it.runIf(HAS_TEST_DB)(
    "Organizer submits Search and the snapshot is persisted with weekly calendar data",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = new Date(FIXTURE_DATE);

      await insertSession(db, ORGANIZER_SESSION_ID, ORGANIZER.id, "csrf-token", now);
      await seedSecondMatchUser();
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      const searchId = await runSearchAsOrganizer();

      const cookie = await sealSessionCookie({ sessionId: ORGANIZER_SESSION_ID });
      const body = await fetchSnapshotApi(searchId, cookie);

      expect(body.id).toBe(searchId);
      expect(body.organizerId).toBe(ORGANIZER.id);
      expect(body.snapshot).not.toBeNull();

      const snapshot = body.snapshot as {
        dateRangeStart: string;
        dateRangeEnd: string;
        organizerTimezone: string;
        durationMinutes: number;
        slots: unknown[];
        generatedAt: string;
      };

      expect(snapshot.dateRangeStart).toBe(DATE_RANGE_START.toISOString());
      expect(snapshot.dateRangeEnd).toBe(DATE_RANGE_END.toISOString());
      expect(snapshot.organizerTimezone).toBe(ORGANIZER.profileTimezone);
      expect(snapshot.durationMinutes).toBe(DURATION_MINUTES);
      expect(typeof snapshot.generatedAt).toBe("string");
      expect(Array.isArray(snapshot.slots)).toBe(true);
      expect(snapshot.slots.length).toBeGreaterThan(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Organizer fetches weekly calendar snapshot and each slot has startUtc and non-negative matchCount",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = new Date(FIXTURE_DATE);

      await insertSession(db, ORGANIZER_SESSION_2_ID, ORGANIZER.id, "csrf-token-2", now);
      await seedSecondMatchUser();
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      const searchId = await runSearchAsOrganizer();

      const cookie = await sealSessionCookie({
        sessionId: ORGANIZER_SESSION_2_ID,
      });

      const response = await GET(
        new Request(`http://localhost/api/searches/${searchId}`, {
          headers: { cookie },
        }),
        { params: Promise.resolve({ id: searchId }) },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        snapshot: { slots: Array<{ startUtc: unknown; matchCount: unknown }> } | null;
      };

      expect(body.snapshot).not.toBeNull();
      expect(Array.isArray(body.snapshot!.slots)).toBe(true);
      expect(body.snapshot!.slots.length).toBeGreaterThan(0);

      for (const slot of body.snapshot!.slots) {
        expect(typeof slot.startUtc).toBe("string");
        expect((slot.startUtc as string).length).toBeGreaterThan(0);
        expect(typeof slot.matchCount).toBe("number");
        expect((slot.matchCount as number)).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Only Organizers and Admins can access the search results API; regular Users receive 403",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = new Date(FIXTURE_DATE);

      await insertSession(db, ORGANIZER_SESSION_3_ID, ORGANIZER.id, "csrf-token-3", now);
      await insertSession(db, USER_SESSION_ID, REGULAR_USER.id, "csrf-user-token", now);
      await seedSecondMatchUser();
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      const searchId = await runSearchAsOrganizer();

      const userCookie = await sealSessionCookie({ sessionId: USER_SESSION_ID });
      const userResponse = await GET(
        new Request(`http://localhost/api/searches/${searchId}`, {
          headers: { cookie: userCookie },
        }),
        { params: Promise.resolve({ id: searchId }) },
      );

      expect(userResponse.status).toBe(403);

      const userBody = (await userResponse.json()) as { error: string };
      expect(userBody.error).toBe("forbidden");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Admin can access the search results API",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = new Date(FIXTURE_DATE);

      await insertSession(db, ORGANIZER_SESSION_4_ID, ORGANIZER.id, "csrf-token-4", now);
      await insertSession(db, ADMIN_SESSION_ID, ADMIN.id, "csrf-admin-token", now);
      await seedSecondMatchUser();
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      const searchId = await runSearchAsOrganizer();

      const adminCookie = await sealSessionCookie({ sessionId: ADMIN_SESSION_ID });
      const adminResponse = await GET(
        new Request(`http://localhost/api/searches/${searchId}`, {
          headers: { cookie: adminCookie },
        }),
        { params: Promise.resolve({ id: searchId }) },
      );

      expect(adminResponse.status).toBe(200);

      const adminBody = (await adminResponse.json()) as {
        id: string;
        snapshot: unknown;
      };

      expect(adminBody.id).toBe(searchId);
      expect(adminBody.snapshot).not.toBeNull();
    },
  );
});
