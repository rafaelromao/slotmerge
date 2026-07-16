import { afterEach, describe, expect, inject, it } from "vitest";

import {
  type ProfileInputs,
  setSearchEligibilityProfileInputsForTests,
} from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { createMatchingDependencies } from "../../src/matching";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { setImportedBusyIntervalRepositoryForTests } from "../../src/calendar/imported-busy-intervals";
import { createPostgresImportedBusyIntervalRepository } from "../../src/calendar/imported-busy-intervals.repository";
import { importedBusyIntervals, type Slot } from "../../src/db/schema";
import { slotHasStaleMatch } from "../../src/search/calendar-utils";
import { FIXTURE_DATE, TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const SECONDARY_ELIGIBLE_USER = USER_FIXTURES[0];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const MATCH_USER_ID = "00000000-0000-0000-0000-000000001121";
const MATCH_USER_EMAIL = "match-user-121@example.com";
const MATCH_USER_DISPLAY_NAME = "Match User";

const SLOT_START_UTC = "2026-07-13T16:00:00.000Z";
const SLOT_END_UTC = "2026-07-13T17:00:00.000Z";
const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;

const STALE_IMPORTED_AT = new Date("2026-07-10T12:00:00.000Z");

const COMPLETE_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: true,
};

async function insertMatchUserWithStaleCalendar(): Promise<string> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE);
  const connectionId = "00000000-0000-0000-0000-000000001124";

  await db.execute(
    `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
     VALUES ('${MATCH_USER_ID}', '${MATCH_USER_EMAIL}', '${MATCH_USER_DISPLAY_NAME}', 'user', 'active', 'UTC', 0, '${now.toISOString()}', '${now.toISOString()}')`,
  );
  await db.execute(
    `INSERT INTO availability_windows (id, user_id, day_of_week, start_time, end_time, profile_timezone, created_at, updated_at)
     VALUES (gen_random_uuid(), '${MATCH_USER_ID}', 1, '00:00', '23:59', 'UTC', '${now.toISOString()}', '${now.toISOString()}')`,
  );
  await db.execute(
    `INSERT INTO user_topics (id, user_id, topic_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), '${MATCH_USER_ID}', '${SELECTED_TOPIC.id}', 'active', '${now.toISOString()}', '${now.toISOString()}')`,
  );
  await db.execute(
    `INSERT INTO calendar_connections (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
     VALUES ('${connectionId}', '${MATCH_USER_ID}', 'google', 'google:match-user-1', 'match.user@gmail.com', 'https://www.googleapis.com/auth/calendar.freebusy', 'connected', '{}', '${now.toISOString()}', '${now.toISOString()}')`,
  );

  await db.insert(importedBusyIntervals).values({
    userId: MATCH_USER_ID,
    connectionId: connectionId,
    providerCalendarId: "calendar-1",
    providerEventReference: "event-1",
    status: "busy",
    startAt: new Date("2026-07-13T08:00:00.000Z"),
    endAt: new Date("2026-07-13T09:00:00.000Z"),
    importedAt: STALE_IMPORTED_AT,
  });

  return connectionId;
}

async function runSearch(): Promise<string> {
  const result = await submitSearch(
    {
      organizerId: ORGANIZER.id,
      activeTopicsRepository: {
        async listActive() {
          return await Promise.resolve([
            {
              id: SELECTED_TOPIC.id,
              name: SELECTED_TOPIC.name,
              status: "active" as const,
            },
          ]);
        },
      },
      profileRepository: {
        async findByUserId() {
          return await Promise.resolve(null);
        },
      },
      clock: { now: getTestClock() },
      matchingPoolSize: 5,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      searchResultRepository: createPostgresSearchResultRepository(),
    },
    {
      selectedTopicIds: [SELECTED_TOPIC.id],
      minimumMatchingUsers: MINIMUM_MATCHING_USERS,
      durationMinutes: DURATION_MINUTES,
      dateRangeStart: new Date(SLOT_START_UTC),
      dateRangeEnd: new Date(SLOT_END_UTC),
      organizerTimezone: ORGANIZER.profileTimezone ?? "UTC",
    },
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("submitSearch did not produce a stored search id");
  }
  return result.search.id;
}

type SearchSnapshotShape = {
  slots: Array<{
    startUtc: string;
    matchCount: number;
    matches: Array<{
      userId: string;
      calendarFreshness: string;
    }>;
  }>;
};

async function loadSnapshot(searchId: string): Promise<SearchSnapshotShape> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ snapshot_json: unknown }>(
    `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`no search_results row for search_id ${searchId}`);
  }
  return row.snapshot_json as SearchSnapshotShape;
}

function matchedUserIds(snapshot: SearchSnapshotShape): string[] {
  return snapshot.slots.flatMap((s) => s.matches.map((m) => m.userId));
}

describe("E2E: stale-data markers appear on affected Slots", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
    setImportedBusyIntervalRepositoryForTests(null);
  });

  describe.runIf(HAS_TEST_DB)("AC1: Slot cell shows a stale marker", () => {
    it(
      "search result Slot contains a match with calendarFreshness: 'stale' " +
        "when the match user's busy intervals were imported more than 24 hours ago",
      async () => {
        const db = getTestDb();
        expect(db).not.toBeNull();
        if (!db) {
          return;
        }

        await setupTest();
        await insertMatchUserWithStaleCalendar();

        setSearchEligibilityProfileInputsForTests({
          [MATCH_USER_ID]: COMPLETE_PROFILE,
          [SECONDARY_ELIGIBLE_USER.id]: COMPLETE_PROFILE,
        });

        await grantDiscoverabilityConsent(MATCH_USER_ID);
        await grantDiscoverabilityConsent(SECONDARY_ELIGIBLE_USER.id);

        setImportedBusyIntervalRepositoryForTests(createPostgresImportedBusyIntervalRepository());

        const searchId = await runSearch();
        const snapshot = await loadSnapshot(searchId);

        expect(snapshot.slots.length).toBeGreaterThan(0);

        const matchUserIds = matchedUserIds(snapshot);
        expect(matchUserIds).toContain(MATCH_USER_ID);

        const staleSlot = snapshot.slots.find((slot) =>
          slotHasStaleMatch(slot as Slot),
        );
        expect(staleSlot).toBeDefined();
        expect(staleSlot?.matches.find((m) => m.userId === MATCH_USER_ID)?.calendarFreshness).toBe("stale");
      },
    );
  });

  describe.runIf(HAS_TEST_DB)(
    "AC2: Stale marker is associated with the stale Calendar Connection",
    () => {
      it(
        "the stale match's userId belongs to the user who owns the stale Calendar Connection",
        async () => {
          const db = getTestDb();
          expect(db).not.toBeNull();
          if (!db) {
            return;
          }

          await setupTest();
          await insertMatchUserWithStaleCalendar();

          setSearchEligibilityProfileInputsForTests({
            [MATCH_USER_ID]: COMPLETE_PROFILE,
            [SECONDARY_ELIGIBLE_USER.id]: COMPLETE_PROFILE,
          });

          await grantDiscoverabilityConsent(MATCH_USER_ID);
          await grantDiscoverabilityConsent(SECONDARY_ELIGIBLE_USER.id);

          setImportedBusyIntervalRepositoryForTests(createPostgresImportedBusyIntervalRepository());

          const searchId = await runSearch();
          const snapshot = await loadSnapshot(searchId);

          expect(snapshot.slots.length).toBeGreaterThan(0);

          const staleMatch = snapshot.slots
            .flatMap((slot) => slot.matches)
            .find((m) => m.calendarFreshness === "stale");

          expect(staleMatch).toBeDefined();
          expect(staleMatch!.userId).toBe(MATCH_USER_ID);

          const importedIntervalResult = await db.execute<{ connection_id: string }>(
            `SELECT connection_id FROM imported_busy_intervals WHERE user_id = '${MATCH_USER_ID}' LIMIT 1`,
          );
          const connectionId = importedIntervalResult.rows[0]?.connection_id;
          expect(connectionId).toBeDefined();

          const connectionResult = await db.execute<{ id: string; user_id: string; status: string }>(
            `SELECT id, user_id, status FROM calendar_connections WHERE id = '${connectionId}' AND user_id = '${MATCH_USER_ID}' AND status = 'connected'`,
          );
          expect(connectionResult.rows[0]?.id).toBe(connectionId);
          expect(connectionResult.rows[0]?.user_id).toBe(MATCH_USER_ID);
          expect(connectionResult.rows[0]?.status).toBe("connected");
        },
      );
    },
  );
});
