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
import { discoverabilityConsents, sessions } from "../../src/db/schema";
import { createMatchingDependencies } from "../../src/matching";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import {
  setSearchEligibilityProfileInputsForTests,
} from "../../src/search/eligibility";
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
    setSearchEligibilityProfileInputsForTests(null);
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
        matchingDependencies: createMatchingDependencies(),
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

      await insertSession(db, "organizer-session", ORGANIZER.id, "csrf-token", now);
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      setSearchEligibilityProfileInputsForTests({
        [REGULAR_USER.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
        [ADMIN.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const searchId = await runSearchAsOrganizer();

      const cookie = await sealSessionCookie({ sessionId: "organizer-session" });
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

      await insertSession(db, "organizer-session-2", ORGANIZER.id, "csrf-token-2", now);
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      setSearchEligibilityProfileInputsForTests({
        [REGULAR_USER.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
        [ADMIN.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const searchId = await runSearchAsOrganizer();

      const cookie = await sealSessionCookie({
        sessionId: "organizer-session-2",
      });

      const response = await GET(
        new Request(`http://localhost/api/searches/${searchId}`, {
          headers: { cookie },
        }),
        { params: Promise.resolve({ id: searchId }) },
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        slots: Array<{ startUtc: unknown; matchCount: unknown }>;
      };

      expect(Array.isArray(body.slots)).toBe(true);
      expect(body.slots.length).toBeGreaterThan(0);

      for (const slot of body.slots) {
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

      await insertSession(db, "organizer-session-3", ORGANIZER.id, "csrf-token-3", now);
      await insertSession(db, "user-session", REGULAR_USER.id, "csrf-user-token", now);
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      setSearchEligibilityProfileInputsForTests({
        [REGULAR_USER.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
        [ADMIN.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const searchId = await runSearchAsOrganizer();

      const userCookie = await sealSessionCookie({ sessionId: "user-session" });
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

      await insertSession(db, "organizer-session-4", ORGANIZER.id, "csrf-token-4", now);
      await insertSession(db, "admin-session", ADMIN.id, "csrf-admin-token", now);
      await grantDiscoverabilityConsent(REGULAR_USER.id);
      await grantDiscoverabilityConsent(ADMIN.id);
      setSearchEligibilityProfileInputsForTests({
        [REGULAR_USER.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
        [ADMIN.id]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const searchId = await runSearchAsOrganizer();

      const adminCookie = await sealSessionCookie({ sessionId: "admin-session" });
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
