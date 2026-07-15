import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

vi.mock("../../src/worker/sync", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    enqueueSyncCalendarConnectionJob: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  clearInMemoryImportedBusyIntervalStore,
  setImportedBusyIntervalRepositoryForTests,
} from "../../src/calendar/imported-busy-intervals";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../../src/calendar/repository";
import { USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";
import {
  handleSyncCalendarConnectionJob,
  enqueueSyncCalendarConnectionJob,
  setClockForTests,
} from "../../src/worker/sync";
import {
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";
import { buildTestClock } from "../test-clock";
import { encryptCalendarToken } from "../../src/calendar/token-encryption";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE = USER_FIXTURES[0];
const GOOGLE_CONNECTION_ID = "00000000-0000-0000-0000-000000000091";

const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

function googleAdapterFetchWithUrlRewrite(
  adapter: MockGoogleCalendarAdapter,
): typeof fetch {
  const inner = adapter.getFetchImpl();
  return (input, init) => {
    if (
      typeof input === "string" &&
      input.startsWith("https://calendar.googleapis.com/")
    ) {
      return inner(
        `https://www.googleapis.com/${input.slice("https://calendar.googleapis.com/".length)}`,
        init,
      );
    }
    if (
      input instanceof URL &&
      input.toString().startsWith("https://calendar.googleapis.com/")
    ) {
      const rewritten = new URL(input.toString());
      rewritten.host = "www.googleapis.com";
      return inner(rewritten, init);
    }
    return inner(input, init);
  };
}

function wireGoogleFetch(adapter: MockGoogleCalendarAdapter): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const rewritten = googleAdapterFetchWithUrlRewrite(adapter);
      return rewritten(input, init);
    }),
  );
}

async function seedConnectedGoogleConnection(
  connectionId: string,
  accessToken: string,
): Promise<void> {
  const accessTokenEncrypted = encryptCalendarToken({
    plaintext: accessToken,
    key: TOKEN_ENCRYPTION_KEY,
  });
  await getRequiredTestDb().execute(
    `INSERT INTO calendar_connections
      (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, access_token_encrypted, created_at, updated_at)
      VALUES
        ('${connectionId}', '${ALICE.id}', 'google', 'google:${connectionId}', 'google:${connectionId}', 'https://www.googleapis.com/auth/calendar.freebusy', 'connected', '["primary"]'::jsonb, '${accessTokenEncrypted}', NOW(), NOW())`,
  );
}

async function getLastSyncAt(connectionId: string): Promise<Date | null> {
  const result = await getRequiredTestDb().execute<{ last_sync_at: Date | null }>(
    `SELECT last_sync_at FROM calendar_connections WHERE id = '${connectionId}'`,
  );
  const value = result.rows[0]?.last_sync_at;
  if (value == null) return null;
  return new Date(value);
}

async function fetchBusyIntervalsForConnection(
  connectionId: string,
): Promise<
  Array<{ provider_calendar_id: string; start_at: Date; end_at: Date }>
> {
  const result = await getRequiredTestDb().execute<{
    provider_calendar_id: string;
    start_at: Date;
    end_at: Date;
  }>(
    `SELECT provider_calendar_id, start_at, end_at
     FROM imported_busy_intervals
     WHERE connection_id = '${connectionId}'
     ORDER BY provider_calendar_id, start_at`,
  );
  return result.rows;
}

async function upsertBusyIntervals(
  connectionId: string,
  intervals: Array<{ providerCalendarId: string; startAt: Date; endAt: Date }>,
): Promise<void> {
  const db = getRequiredTestDb();
  for (const interval of intervals) {
    await db.execute(
      `DELETE FROM imported_busy_intervals
       WHERE connection_id = '${connectionId}' AND provider_calendar_id = '${interval.providerCalendarId}' AND start_at = '${interval.startAt.toISOString()}'`,
    );
    await db.execute(
      `INSERT INTO imported_busy_intervals
        (id, user_id, connection_id, provider_calendar_id, status, start_at, end_at, imported_at)
        VALUES
          (gen_random_uuid(), '${ALICE.id}', '${connectionId}', '${interval.providerCalendarId}', 'busy', '${interval.startAt.toISOString()}', '${interval.endAt.toISOString()}', NOW())`,
    );
  }
}

async function clearTestConnection(connectionId: string): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM imported_busy_intervals WHERE connection_id = '${connectionId}'`,
  );
  await getRequiredTestDb().execute(
    `DELETE FROM calendar_connections WHERE id = '${connectionId}'`,
  );
}

describe("E2E: reconcile Calendar Connection sync keeps busy intervals fresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(getTestClock()());
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    setClockForTests(null);
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    setImportedBusyIntervalRepositoryForTests(null);
    clearInMemoryImportedBusyIntervalStore();
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
    await clearTestConnection(GOOGLE_CONNECTION_ID);
  });

  it.runIf(HAS_TEST_DB)(
    "reconciliation refreshes the rolling 90-day window with updated busy intervals from the mock adapter",
    async () => {
      await setupTest();

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-reconcile",
        refreshToken: "google-refresh-token-reconcile",
      });

      const testClock = getTestClock()();

      const oldBusyStart = new Date(testClock.getTime() + 1 * 60 * 60 * 1000);
      const oldBusyEnd = new Date(oldBusyStart.getTime() + 60 * 60 * 1000);
      adapter.setFreeBusyResponse("primary", [
        {
          start: oldBusyStart,
          end: oldBusyEnd,
          status: "busy",
        },
      ]);
      wireGoogleFetch(adapter);

      await seedConnectedGoogleConnection(
        GOOGLE_CONNECTION_ID,
        "google-access-token-reconcile",
      );
      await upsertBusyIntervals(GOOGLE_CONNECTION_ID, [
        {
          providerCalendarId: "primary",
          startAt: oldBusyStart,
          endAt: oldBusyEnd,
        },
      ]);

      const newBusyStart = new Date(testClock.getTime() + 3 * 60 * 60 * 1000);
      const newBusyEnd = new Date(newBusyStart.getTime() + 2 * 60 * 60 * 1000);
      adapter.setFreeBusyResponse("primary", [
        {
          start: newBusyStart,
          end: newBusyEnd,
          status: "busy",
        },
      ]);

      const clock = buildTestClock(testClock);
      setClockForTests(() => clock.now());

      await handleSyncCalendarConnectionJob({ connectionId: GOOGLE_CONNECTION_ID });

      const intervals = await fetchBusyIntervalsForConnection(GOOGLE_CONNECTION_ID);
      expect(intervals).toHaveLength(1);
      expect(new Date(intervals[0].start_at).getTime()).toBe(newBusyStart.getTime());
      expect(new Date(intervals[0].end_at).getTime()).toBe(newBusyEnd.getTime());
    },
  );

  it.runIf(HAS_TEST_DB)(
    "last_sync advances after successful reconciliation",
    async () => {
      await setupTest();

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-last-sync",
        refreshToken: "google-refresh-token-last-sync",
      });

      const testClock = getTestClock()();

      adapter.setFreeBusyResponse("primary", [
        {
          start: new Date(testClock.getTime() + 1 * 60 * 60 * 1000),
          end: new Date(testClock.getTime() + 2 * 60 * 60 * 1000),
          status: "busy",
        },
      ]);
      wireGoogleFetch(adapter);

      await seedConnectedGoogleConnection(
        GOOGLE_CONNECTION_ID,
        "google-access-token-last-sync",
      );

      const lastSyncBefore = await getLastSyncAt(GOOGLE_CONNECTION_ID);
      expect(lastSyncBefore).toBeNull();

      const clock = buildTestClock(testClock);
      setClockForTests(() => clock.now());

      await handleSyncCalendarConnectionJob({ connectionId: GOOGLE_CONNECTION_ID });

      const lastSyncAfter = await getLastSyncAt(GOOGLE_CONNECTION_ID);
      expect(lastSyncAfter).not.toBeNull();
      expect(lastSyncAfter!.getTime()).toBe(clock.now().getTime());
    },
  );
});
