import { eq } from "drizzle-orm";
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
import {
  availabilityWindows,
  discoverabilityConsents,
  sessions,
  userTopics,
  users,
} from "../../src/db/schema";
import { createMatchingDependencies } from "../../src/matching";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import { getProfileByUserId } from "../../src/profile/repository";
import { listActiveTopics } from "../../src/topics/repository";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const ORGANIZER_A = USER_FIXTURES[1];
const ADMIN = USER_FIXTURES[2];

const ORGANIZER_B_ID = "00000000-0000-0000-0000-0000000000b1";
const ORGANIZER_B_SESSION_ID = "00000000-0000-0000-0000-0000000000b2";
const ORGANIZER_B_CSRF = "organizer-b-csrf";

const ADMIN_SESSION_ID = "00000000-0000-0000-0000-0000000000c1";
const ADMIN_CSRF = "admin-csrf-111";

const ORGANIZER_A_SESSION_ID = "00000000-0000-0000-0000-0000000000a1";
const ORGANIZER_A_CSRF = "organizer-a-csrf-111";

const MATCH_USER_ID = "00000000-0000-0000-0000-0000000000d1";
const MATCH_USER_TOPIC_ID = "00000000-0000-0000-0000-0000000000d2";
const MATCH_USER_AVAILABILITY_WINDOW_ID =
  "00000000-0000-0000-0000-0000000000d3";

const DATE_RANGE_START = new Date("2026-07-13T13:00:00.000Z");
const DATE_RANGE_END = new Date("2026-07-13T14:00:00.000Z");
const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;

type SnapshotResponseBody = {
  id: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  organizerTimezone: string;
  generatedAt: string;
  snapshot: unknown;
};

async function insertSession({
  db,
  sessionId,
  userId,
  csrfToken,
  now,
}: {
  db: NonNullable<ReturnType<typeof getTestDb>>;
  sessionId: string;
  userId: string;
  csrfToken: string;
  now: Date;
}): Promise<void> {
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    csrfToken,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: now,
  });
}

async function seedMatchableUser(
  db: NonNullable<ReturnType<typeof getTestDb>>,
): Promise<void> {
  const now = new Date(FIXTURE_DATE);
  await db.insert(users).values({
    id: MATCH_USER_ID,
    email: "match-user-111@example.com",
    displayName: "Match User Original Name",
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
    id: MATCH_USER_TOPIC_ID,
    userId: MATCH_USER_ID,
    topicId: TOPIC_FIXTURES[0].id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(availabilityWindows).values({
    id: MATCH_USER_AVAILABILITY_WINDOW_ID,
    userId: MATCH_USER_ID,
    dayOfWeek: 1,
    startTime: "13:00",
    endTime: "14:00",
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
  });
}

async function submitSearchForOrganizer(
  organizerId: string,
  topicIds: string[],
): Promise<string> {
  const result = await submitSearch(
    {
      organizerId,
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
      discoverableUserRepository: getDiscoverableUserRepository(),
      searchResultRepository: getSearchResultRepository(),
    },
    {
      selectedTopicIds: topicIds,
      minimumMatchingUsers: MINIMUM_MATCHING_USERS,
      durationMinutes: DURATION_MINUTES,
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

async function fetchSnapshot(
  searchId: string,
  cookie: string,
): Promise<SnapshotResponseBody> {
  const response = await GET(
    new Request(`http://localhost/api/searches/${searchId}`, {
      headers: { cookie },
    }),
    { params: Promise.resolve({ id: searchId }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as SnapshotResponseBody;
}

describe("E2E: Search history is visible to all Organizer and Admin and immutable", () => {
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
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "persists a Search Result for Organizer A and reads it back through the API",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = getTestClock()();

      await insertSession({
        db,
        sessionId: ORGANIZER_A_SESSION_ID,
        userId: ORGANIZER_A.id,
        csrfToken: ORGANIZER_A_CSRF,
        now,
      });

      await seedMatchableUser(db);

      const searchId = await submitSearchForOrganizer(ORGANIZER_A.id, [
        TOPIC_FIXTURES[0].id,
      ]);

      const organizerACookie = await sealSessionCookie({
        sessionId: ORGANIZER_A_SESSION_ID,
      });

      const body = await fetchSnapshot(searchId, organizerACookie);

      expect(body.id).toBe(searchId);
      expect(body.organizerId).toBe(ORGANIZER_A.id);
      expect(body.snapshot).toMatchObject({
        organizerTimezone: "UTC",
        dateRangeStart: DATE_RANGE_START.toISOString(),
        dateRangeEnd: DATE_RANGE_END.toISOString(),
        durationMinutes: DURATION_MINUTES,
      });
      expect(Array.isArray((body.snapshot as { slots: unknown[] }).slots)).toBe(
        true,
      );
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Organizer B reads Organizer A's Search Result and sees the same snapshot",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = getTestClock()();

      await db.insert(users).values({
        id: ORGANIZER_B_ID,
        email: "organizer-b-111@example.com",
        displayName: "Organizer B",
        role: "organizer",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });

      await insertSession({
        db,
        sessionId: ORGANIZER_A_SESSION_ID,
        userId: ORGANIZER_A.id,
        csrfToken: ORGANIZER_A_CSRF,
        now,
      });
      await insertSession({
        db,
        sessionId: ORGANIZER_B_SESSION_ID,
        userId: ORGANIZER_B_ID,
        csrfToken: ORGANIZER_B_CSRF,
        now,
      });

      await seedMatchableUser(db);

      const searchId = await submitSearchForOrganizer(ORGANIZER_A.id, [
        TOPIC_FIXTURES[0].id,
      ]);

      const organizerACookie = await sealSessionCookie({
        sessionId: ORGANIZER_A_SESSION_ID,
      });
      const organizerBCookie = await sealSessionCookie({
        sessionId: ORGANIZER_B_SESSION_ID,
      });

      const organizerAView = await fetchSnapshot(searchId, organizerACookie);
      const organizerBView = await fetchSnapshot(searchId, organizerBCookie);

      expect(organizerBView).toEqual(organizerAView);
      expect(organizerBView.organizerId).toBe(ORGANIZER_A.id);
      expect(organizerBView.snapshot).toEqual(organizerAView.snapshot);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Admin reads Organizer A's Search Result and sees the same snapshot as Organizer B",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = getTestClock()();

      await db.insert(users).values({
        id: ORGANIZER_B_ID,
        email: "organizer-b-111@example.com",
        displayName: "Organizer B",
        role: "organizer",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });

      await insertSession({
        db,
        sessionId: ORGANIZER_A_SESSION_ID,
        userId: ORGANIZER_A.id,
        csrfToken: ORGANIZER_A_CSRF,
        now,
      });
      await insertSession({
        db,
        sessionId: ORGANIZER_B_SESSION_ID,
        userId: ORGANIZER_B_ID,
        csrfToken: ORGANIZER_B_CSRF,
        now,
      });
      await insertSession({
        db,
        sessionId: ADMIN_SESSION_ID,
        userId: ADMIN.id,
        csrfToken: ADMIN_CSRF,
        now,
      });

      await seedMatchableUser(db);

      const searchId = await submitSearchForOrganizer(ORGANIZER_A.id, [
        TOPIC_FIXTURES[0].id,
      ]);

      const organizerBCookie = await sealSessionCookie({
        sessionId: ORGANIZER_B_SESSION_ID,
      });
      const adminCookie = await sealSessionCookie({
        sessionId: ADMIN_SESSION_ID,
      });

      const organizerBView = await fetchSnapshot(searchId, organizerBCookie);
      const adminView = await fetchSnapshot(searchId, adminCookie);

      expect(adminView).toEqual(organizerBView);
      expect(adminView.snapshot).toEqual(organizerBView.snapshot);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "snapshot is immutable: subsequent data changes do not change the snapshot returned for an existing search id",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const now = getTestClock()();

      await db.insert(users).values({
        id: ORGANIZER_B_ID,
        email: "organizer-b-111@example.com",
        displayName: "Organizer B",
        role: "organizer",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        createdAt: now,
        updatedAt: now,
      });

      await insertSession({
        db,
        sessionId: ORGANIZER_A_SESSION_ID,
        userId: ORGANIZER_A.id,
        csrfToken: ORGANIZER_A_CSRF,
        now,
      });
      await insertSession({
        db,
        sessionId: ORGANIZER_B_SESSION_ID,
        userId: ORGANIZER_B_ID,
        csrfToken: ORGANIZER_B_CSRF,
        now,
      });
      await insertSession({
        db,
        sessionId: ADMIN_SESSION_ID,
        userId: ADMIN.id,
        csrfToken: ADMIN_CSRF,
        now,
      });

      await seedMatchableUser(db);

      const searchId = await submitSearchForOrganizer(ORGANIZER_A.id, [
        TOPIC_FIXTURES[0].id,
      ]);

      const organizerACookie = await sealSessionCookie({
        sessionId: ORGANIZER_A_SESSION_ID,
      });
      const organizerBCookie = await sealSessionCookie({
        sessionId: ORGANIZER_B_SESSION_ID,
      });
      const adminCookie = await sealSessionCookie({
        sessionId: ADMIN_SESSION_ID,
      });

      const originalView = await fetchSnapshot(searchId, organizerACookie);
      const originalSnapshot = originalView.snapshot;

      await db.delete(userTopics).where(eq(userTopics.userId, MATCH_USER_ID));

      await db
        .update(availabilityWindows)
        .set({ startTime: "00:00", endTime: "01:00" })
        .where(eq(availabilityWindows.userId, MATCH_USER_ID));

      await db
        .update(users)
        .set({ displayName: "Mutated Display Name" })
        .where(eq(users.id, MATCH_USER_ID));

      const organizerBView = await fetchSnapshot(searchId, organizerBCookie);
      expect(organizerBView.snapshot).toEqual(originalSnapshot);

      const adminView = await fetchSnapshot(searchId, adminCookie);
      expect(adminView.snapshot).toEqual(originalSnapshot);

      const reReadOrganizerA = await fetchSnapshot(searchId, organizerACookie);
      expect(reReadOrganizerA.snapshot).toEqual(originalSnapshot);
    },
  );
});
