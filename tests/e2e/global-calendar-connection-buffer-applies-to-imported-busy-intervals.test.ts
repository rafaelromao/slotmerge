import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

import {
  clearInMemoryImportedBusyIntervalStore,
  setImportedBusyIntervalRepositoryForTests,
} from "../../src/calendar/imported-busy-intervals";
import { createPostgresImportedBusyIntervalRepository } from "../../src/calendar/imported-busy-intervals.repository";
import {
  setCalendarConnectionRepositoryForTests,
} from "../../src/calendar/repository";
import { calendarConnections } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { createMatchingDependencies } from "../../src/matching";
import { getProfileByUserId } from "../../src/profile/repository";
import { getDiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { getSearchResultRepository } from "../../src/search/search-result-repository";
import { listActiveTopics } from "../../src/topics/repository";
import {
  TOPIC_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[1];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const CANDIDATE_USER_ID = "00000000-0000-0000-0000-000000000085";
const CANDIDATE_USER_TOPIC_ID = "00000000-0000-0000-0000-000000000086";
const CANDIDATE_SESSION_ID = "00000000-0000-0000-0000-000000000087";
const CANDIDATE_CSRF = "candidate-csrf-85";
const CANDIDATE_CONNECTION_ID = "00000000-0000-0000-0000-000000000088";

const ALWAYS_AVAILABLE_USER_ID = "00000000-0000-0000-0000-000000000090";
const ALWAYS_AVAILABLE_USER_TOPIC_ID = "00000000-0000-0000-0000-000000000091";

const PROFILE_TIMEZONE = "UTC";
const DURATION_MINUTES = 30;
const LONG_DURATION_MINUTES = 60;

const SLOT_START_09_00 = new Date("2026-07-13T09:00:00.000Z");
const SLOT_START_10_00 = new Date("2026-07-13T10:00:00.000Z");
const SLOT_START_11_00 = new Date("2026-07-13T11:00:00.000Z");

const BUSY_START = new Date("2026-07-13T10:00:00.000Z");
const BUSY_END = new Date("2026-07-13T11:00:00.000Z");

const BUFFER_MINUTES = 15;

type SearchParams = Parameters<typeof submitSearch>[1];

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

function buildSearchParams(slotStart: Date): SearchParams {
  const rangeEnd = new Date(slotStart.getTime() + 60 * 60_000);
  return {
    selectedTopicIds: [SELECTED_TOPIC.id],
    minimumMatchingUsers: 2,
    durationMinutes: DURATION_MINUTES,
    dateRangeStart: slotStart,
    dateRangeEnd: rangeEnd,
    organizerTimezone: PROFILE_TIMEZONE,
  };
}

async function runSearch(slotStart: Date): Promise<string> {
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
      matchingPoolSize: 10,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: getDiscoverableUserRepository(),
      searchResultRepository: getSearchResultRepository(),
    },
    buildSearchParams(slotStart),
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("expected Search submission to succeed");
  }
  return result.search.id;
}

async function seedCandidateUser(): Promise<void> {
  const db = getRequiredTestDb();
  const now = new Date("2026-07-12T12:00:00.000Z");

  await db.execute(
    `INSERT INTO users
      (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
    VALUES
      ('${CANDIDATE_USER_ID}', 'candidate@example.com', 'Test Candidate', 'user', 'active', '${PROFILE_TIMEZONE}', ${BUFFER_MINUTES}, '${now.toISOString()}', '${now.toISOString()}')
    ON CONFLICT (id) DO UPDATE SET
      buffer_minutes = EXCLUDED.buffer_minutes,
      profile_timezone = EXCLUDED.profile_timezone`,
  );

  await db.execute(
    `DELETE FROM availability_windows WHERE user_id = '${CANDIDATE_USER_ID}'`,
  );

  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone)
     VALUES ('00000000-0000-0000-0000-000000000089', '${CANDIDATE_USER_ID}', 1, '09:00', '17:00', '${PROFILE_TIMEZONE}')
     ON CONFLICT (id) DO NOTHING`,
  );

  await db.execute(
    `INSERT INTO user_topics
      (id, user_id, topic_id, status, created_at, updated_at)
    VALUES
      ('${CANDIDATE_USER_TOPIC_ID}', '${CANDIDATE_USER_ID}', '${SELECTED_TOPIC.id}', 'active', '${now.toISOString()}', '${now.toISOString()}')
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
  );

  await db.execute(
    `INSERT INTO discoverability_consents (user_id, granted_at)
    VALUES ('${CANDIDATE_USER_ID}', '${now.toISOString()}')
    ON CONFLICT (user_id) DO NOTHING`,
  );

  await db.execute(
    `DELETE FROM sessions WHERE user_id = '${CANDIDATE_USER_ID}'`,
  );

  await db.execute(
    `INSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at)
    VALUES ('${CANDIDATE_SESSION_ID}', '${CANDIDATE_USER_ID}', '${CANDIDATE_CSRF}', '2099-01-01T00:00:00.000Z', '${now.toISOString()}')
    ON CONFLICT (id) DO UPDATE SET csrf_token = EXCLUDED.csrf_token`,
  );
}

async function seedAlwaysAvailableUser(): Promise<void> {
  const db = getRequiredTestDb();
  const now = new Date("2026-07-12T12:00:00.000Z");

  await db.execute(
    `INSERT INTO users
      (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
    VALUES
      ('${ALWAYS_AVAILABLE_USER_ID}', 'always-available@example.com', 'Always Available User', 'user', 'active', '${PROFILE_TIMEZONE}', 0, '${now.toISOString()}', '${now.toISOString()}')
    ON CONFLICT (id) DO UPDATE SET
      buffer_minutes = 0,
      profile_timezone = EXCLUDED.profile_timezone`,
  );

  await db.execute(
    `DELETE FROM availability_windows WHERE user_id = '${ALWAYS_AVAILABLE_USER_ID}'`,
  );

  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone)
     VALUES ('00000000-0000-0000-0000-000000000092', '${ALWAYS_AVAILABLE_USER_ID}', 1, '09:00', '17:00', '${PROFILE_TIMEZONE}')
     ON CONFLICT (id) DO NOTHING`,
  );

  await db.execute(
    `INSERT INTO user_topics
      (id, user_id, topic_id, status, created_at, updated_at)
    VALUES
      ('${ALWAYS_AVAILABLE_USER_TOPIC_ID}', '${ALWAYS_AVAILABLE_USER_ID}', '${SELECTED_TOPIC.id}', 'active', '${now.toISOString()}', '${now.toISOString()}')
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
  );

  await db.execute(
    `INSERT INTO discoverability_consents (user_id, granted_at)
    VALUES ('${ALWAYS_AVAILABLE_USER_ID}', '${now.toISOString()}')
    ON CONFLICT (user_id) DO NOTHING`,
  );
}

async function seedCalendarConnectionForCandidate(): Promise<void> {
  const db = getRequiredTestDb();

  await db.execute(
    `DELETE FROM calendar_connections WHERE id = '${CANDIDATE_CONNECTION_ID}'`,
  );

  await db.execute(
    `INSERT INTO calendar_connections
      (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
    VALUES
      ('${CANDIDATE_CONNECTION_ID}', '${CANDIDATE_USER_ID}', 'google', 'google:${CANDIDATE_CONNECTION_ID}', 'google:${CANDIDATE_CONNECTION_ID}', 'https://www.googleapis.com/auth/calendar.freebusy', 'connected', '["primary"]'::jsonb, NOW(), NOW())`,
  );
}

async function seedImportedBusyInterval(): Promise<void> {
  const db = getRequiredTestDb();

  await db.execute(
    `DELETE FROM imported_busy_intervals WHERE connection_id = '${CANDIDATE_CONNECTION_ID}'`,
  );

  await db.execute(
    `INSERT INTO imported_busy_intervals
      (id, user_id, connection_id, provider_calendar_id, provider_event_reference, status, start_at, end_at, imported_at)
    VALUES
      (gen_random_uuid(), '${CANDIDATE_USER_ID}', '${CANDIDATE_CONNECTION_ID}', 'primary', 'test-event-ref', 'busy', '${BUSY_START.toISOString()}', '${BUSY_END.toISOString()}', NOW())`,
  );
}

async function updateCandidateBufferMinutes(bufferMinutes: number): Promise<void> {
  const db = getRequiredTestDb();
  await db.execute(
    `UPDATE users SET buffer_minutes = ${bufferMinutes} WHERE id = '${CANDIDATE_USER_ID}'`,
  );
}

async function queryImportedBusyIntervals(): Promise<
  Array<{ start_at: Date; end_at: Date; status: string }>
> {
  const db = getRequiredTestDb();
  const result = await db.execute<{
    start_at: Date;
    end_at: Date;
    status: string;
  }>(
    `SELECT start_at, end_at, status FROM imported_busy_intervals WHERE connection_id = '${CANDIDATE_CONNECTION_ID}' ORDER BY start_at`,
  );
  return result.rows;
}

function wireTestRepositories(): void {
  const db = getRequiredTestDb();

  const repository = {
    createPending: (record: unknown) => Promise.resolve(record),
    listByUserId: async () => {
      const rows = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.provider, "google"));
      return rows;
    },
    findById: async (id: string) => {
      const [row] = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.id, id))
        .limit(1);
      if (!row || row.provider !== "google") return null;
      return row;
    },
    updateById: async (id: string, patch: Record<string, unknown>) => {
      const sets: ReturnType<typeof sql>[] = [];
      if ("status" in patch) sets.push(sql`status = ${patch.status as string}`);
      if ("contributingCalendarIds" in patch)
        sets.push(sql`contributing_calendar_ids = ${JSON.stringify(patch.contributingCalendarIds)}`);
      if (sets.length > 0) {
        await db.execute(sql`UPDATE calendar_connections SET ${sql.join(sets)} WHERE id = ${id}`);
      }
    },
  };

  setCalendarConnectionRepositoryForTests(repository as never);
  setImportedBusyIntervalRepositoryForTests(createPostgresImportedBusyIntervalRepository());
}

describe("E2E: global Calendar Connection buffer applies to imported busy intervals", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(getTestClock()());
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

    await setupTest();
    await seedAlwaysAvailableUser();
    await seedCandidateUser();
    await seedCalendarConnectionForCandidate();
    await seedImportedBusyInterval();
    wireTestRepositories();

    setSearchEligibilityProfileInputsForTests({
      [CANDIDATE_USER_ID]: {
        hasDisplayName: true,
        hasTopicOrProposal: true,
        hasAvailabilitySource: true,
        isActive: true,
      },
      [ALWAYS_AVAILABLE_USER_ID]: {
        hasDisplayName: true,
        hasTopicOrProposal: true,
        hasAvailabilitySource: true,
        isActive: true,
      },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    setSearchEligibilityProfileInputsForTests(null);
    setImportedBusyIntervalRepositoryForTests(null);
    clearInMemoryImportedBusyIntervalStore();

    const db = getTestDb();
    if (db) {
      await db.execute(`DELETE FROM imported_busy_intervals WHERE connection_id = '${CANDIDATE_CONNECTION_ID}'`);
      await db.execute(`DELETE FROM calendar_connections WHERE id = '${CANDIDATE_CONNECTION_ID}'`);
      await db.execute(`DELETE FROM sessions WHERE user_id = '${CANDIDATE_USER_ID}'`);
      await db.execute(`DELETE FROM user_topics WHERE id = '${CANDIDATE_USER_TOPIC_ID}'`);
      await db.execute(`DELETE FROM availability_windows WHERE user_id = '${CANDIDATE_USER_ID}'`);
      await db.execute(`DELETE FROM users WHERE id = '${CANDIDATE_USER_ID}'`);
      await db.execute(`DELETE FROM user_topics WHERE id = '${ALWAYS_AVAILABLE_USER_TOPIC_ID}'`);
      await db.execute(`DELETE FROM availability_windows WHERE user_id = '${ALWAYS_AVAILABLE_USER_ID}'`);
      await db.execute(`DELETE FROM users WHERE id = '${ALWAYS_AVAILABLE_USER_ID}'`);
    }
  });

  it.runIf(HAS_TEST_DB)(
    "imported busy interval is persisted and readable from DB",
    async () => {
      const intervals = await queryImportedBusyIntervals();

      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0].start_at).getTime()).toBe(BUSY_START.getTime());
      expect(new Date(intervals[0].end_at).getTime()).toBe(BUSY_END.getTime());
      expect(intervals[0].status).toBe("busy");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "search with 15-min buffer excludes leading buffer 09:45-10:00",
    async () => {
      const searchResultRepository = getSearchResultRepository();

      const searchParams60 = {
        selectedTopicIds: [SELECTED_TOPIC.id],
        minimumMatchingUsers: 2,
        durationMinutes: LONG_DURATION_MINUTES,
        dateRangeStart: SLOT_START_09_00,
        dateRangeEnd: new Date(SLOT_START_09_00.getTime() + LONG_DURATION_MINUTES * 60_000),
        organizerTimezone: PROFILE_TIMEZONE,
      };

      const result09 = await submitSearch(
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
          matchingPoolSize: 10,
          matchingDependencies: createMatchingDependencies(),
          discoverableUserRepository: getDiscoverableUserRepository(),
          searchResultRepository: getSearchResultRepository(),
        },
        searchParams60,
      );

      expect(result09.ok).toBe(true);
      if (!result09.ok || !result09.search.id) {
        throw new Error("expected Search submission to succeed");
      }

      const snapshot09 = await searchResultRepository.findBySearchId(result09.search.id);
      expect(snapshot09).not.toBeNull();
      expect(snapshot09!.snapshotJson.slots).toHaveLength(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "search with 15-min buffer excludes trailing buffer 10:00-11:15 from matches",
    async () => {
      const searchResultRepository = getSearchResultRepository();

      const searchId10 = await runSearch(SLOT_START_10_00);
      const snapshot10 = await searchResultRepository.findBySearchId(searchId10);
      expect(snapshot10).not.toBeNull();
      expect(snapshot10!.snapshotJson).toEqual({
        generatedAt: "2026-07-12T12:00:00.002Z",
        organizerTimezone: PROFILE_TIMEZONE,
        dateRangeStart: SLOT_START_10_00.toISOString(),
        dateRangeEnd: new Date(SLOT_START_10_00.getTime() + DURATION_MINUTES * 60_000).toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: [
          {
            startUtc: SLOT_START_10_00.toISOString(),
            matchCount: 0,
            matches: [],
          },
        ],
      });
    },
  );

  it.runIf(HAS_TEST_DB)(
    "buffer change takes effect on next Search without re-importing busy intervals",
    async () => {
      const searchResultRepository = getSearchResultRepository();

      const searchId11Before = await runSearch(SLOT_START_11_00);
      const snapshot11Before = await searchResultRepository.findBySearchId(searchId11Before);
      expect(snapshot11Before!.snapshotJson).toEqual({
        generatedAt: "2026-07-12T12:00:00.003Z",
        organizerTimezone: PROFILE_TIMEZONE,
        dateRangeStart: SLOT_START_11_00.toISOString(),
        dateRangeEnd: new Date(SLOT_START_11_00.getTime() + DURATION_MINUTES * 60_000).toISOString(),
        durationMinutes: DURATION_MINUTES,
        slots: [
          {
            startUtc: SLOT_START_11_00.toISOString(),
            matchCount: 0,
            matches: [],
          },
        ],
      });

      await updateCandidateBufferMinutes(0);

      const searchId11After = await runSearch(SLOT_START_11_00);
      const snapshot11After = await searchResultRepository.findBySearchId(searchId11After);
      expect(snapshot11After!.snapshotJson.slots[0]).toEqual({
        startUtc: SLOT_START_11_00.toISOString(),
        matchCount: 2,
        matches: [
          expect.objectContaining({ userId: CANDIDATE_USER_ID }),
          expect.objectContaining({ userId: ALWAYS_AVAILABLE_USER_ID }),
        ],
      });
    },
  );
});
