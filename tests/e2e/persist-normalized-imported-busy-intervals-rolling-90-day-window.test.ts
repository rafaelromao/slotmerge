import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

import { POST as POST_CALLBACK } from "../../app/me/calendar-connections/callback/route";
import { decryptCalendarToken } from "../../src/calendar/token-encryption";
import { createPostgresImportedBusyIntervalRepository } from "../../src/calendar/imported-busy-intervals.repository";
import {
  clearInMemoryImportedBusyIntervalStore,
  setImportedBusyIntervalRepositoryForTests,
} from "../../src/calendar/imported-busy-intervals";
import { syncCalendarConnection } from "../../src/calendar/sync";
import { googleCalendarProvider } from "../../src/calendar/providers";
import { sealCalendarConnectionState } from "../../src/calendar/connection";
import type { CalendarConnectionRecord } from "../../src/calendar/connection";
import { setCalendarConnectionRepositoryForTests } from "../../src/calendar/repository";
import { calendarConnections } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";
import {
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE = USER_FIXTURES[0];
const SESSION = SESSION_FIXTURES[0];

const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const GOOGLE_CONNECTION_ID = "00000000-0000-0000-0000-000000000091";

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

async function postCallback(form: FormData): Promise<Response> {
  return POST_CALLBACK(
    new Request("http://localhost/me/calendar-connections/callback", {
      method: "POST",
      body: form,
    }),
  );
}

async function seedPendingGoogleConnection(
  connectionId: string,
): Promise<void> {
  await getRequiredTestDb().execute(
    `INSERT INTO calendar_connections
      (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
      VALUES
        ('${connectionId}', '${ALICE.id}', 'google', 'google:${connectionId}', 'google:${connectionId}', 'https://www.googleapis.com/auth/calendar.freebusy', 'pending', '[]'::jsonb, NOW(), NOW())`,
  );
}

async function clearTestConnection(connectionId: string): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM imported_busy_intervals WHERE connection_id = '${connectionId}'`,
  );
  await getRequiredTestDb().execute(
    `DELETE FROM calendar_connections WHERE id = '${connectionId}'`,
  );
}

function wireTestRepositories(): void {
  const db = getRequiredTestDb();

  setCalendarConnectionRepositoryForTests({
    createPending: (record) => Promise.resolve(record),
    listByUserId: async (userId) => {
      const rows = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, userId));
      return rows;
    },
    findById: async (id) => {
      const [row] = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.id, id))
        .limit(1);
      return row ?? null;
    },
    updateById: async (id, patch) => {
      const sets: ReturnType<typeof sql>[] = [];
      if ("accountIdentifier" in patch)
        sets.push(sql`account_identifier = ${patch.accountIdentifier}`);
      if ("providerAccountKey" in patch)
        sets.push(sql`provider_account_key = ${patch.providerAccountKey}`);
      if ("scopes" in patch) sets.push(sql`scopes = ${patch.scopes}`);
      if ("status" in patch) sets.push(sql`status = ${patch.status}`);
      if ("accessTokenEncrypted" in patch)
        sets.push(sql`access_token_encrypted = ${patch.accessTokenEncrypted}`);
      if ("refreshTokenEncrypted" in patch)
        sets.push(
          sql`refresh_token_encrypted = ${patch.refreshTokenEncrypted}`,
        );
      if ("accessTokenExpiresAt" in patch)
        sets.push(sql`access_token_expires_at = ${patch.accessTokenExpiresAt}`);
      if ("lastErrorCode" in patch)
        sets.push(sql`last_error_code = ${patch.lastErrorCode}`);
      if ("lastErrorMessage" in patch)
        sets.push(sql`last_error_message = ${patch.lastErrorMessage}`);
      if ("lastSyncAt" in patch)
        sets.push(sql`last_sync_at = ${patch.lastSyncAt}`);
      if ("contributingCalendarIds" in patch)
        sets.push(
          sql`contributing_calendar_ids = ${JSON.stringify(
            patch.contributingCalendarIds,
          )}::jsonb`,
        );
      sets.push(sql`updated_at = NOW()`);

      const setSql = sets.reduce((acc, curr, i) =>
        i === 0 ? curr : sql`${acc}, ${curr}`,
      );

      const result = await db.execute(
        sql`UPDATE calendar_connections SET ${setSql} WHERE id = ${id} RETURNING *`,
      );
      return (result.rows[0] ?? null) as CalendarConnectionRecord | null;
    },
  });
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
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes("googleapis.com")) {
        return googleAdapterFetchWithUrlRewrite(adapter)(input, init);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    }),
  );
}

async function runSyncForGoogleConnection(params: {
  adapter: MockGoogleCalendarAdapter;
  connectionId: string;
  contributingCalendarIds: string[];
  accessToken: string;
  userId: string;
}): Promise<void> {
  const fetchImpl = googleAdapterFetchWithUrlRewrite(params.adapter);
  const now = getTestClock()();
  await syncCalendarConnection({
    connectionId: params.connectionId,
    provider: googleCalendarProvider,
    accessToken: params.accessToken,
    contributingCalendarIds: params.contributingCalendarIds,
    userId: params.userId,
    timeMin: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    fetchImpl,
    busyIntervalRepository: createPostgresImportedBusyIntervalRepository(),
    recordFailure: () => Promise.resolve(undefined),
    clock: () => now,
  });
}

async function fetchBusyIntervalsWithStatus(connectionId: string): Promise<
  Array<{
    provider_calendar_id: string;
    start_at: string;
    end_at: string;
    status: string;
  }>
> {
  const result = await getRequiredTestDb().execute<{
    provider_calendar_id: string;
    start_at: string;
    end_at: string;
    status: string;
  }>(
    `SELECT provider_calendar_id, start_at, end_at, status
     FROM imported_busy_intervals
     WHERE connection_id = '${connectionId}'
     ORDER BY provider_calendar_id, start_at`,
  );
  return result.rows;
}

describe("E2E: persist normalized imported busy intervals for the rolling 90-day window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(getTestClock()());
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
  });

  afterEach(async () => {
    vi.useRealTimers();
    clearInMemoryImportedBusyIntervalStore();
    setImportedBusyIntervalRepositoryForTests(null);
    setCalendarConnectionRepositoryForTests(null);
    if (HAS_TEST_DB) {
      await clearTestConnection(GOOGLE_CONNECTION_ID);
    }
  });

  it.runIf(HAS_TEST_DB)(
    "sync persists busy intervals with normalized statuses (busy and out-of-office)",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-statuses",
        refreshToken: "google-refresh-token-statuses",
      });

      const testClock = getTestClock()();
      const busyStart = new Date(testClock.getTime() + 2 * 60 * 60 * 1000);
      const busyEnd = new Date(busyStart.getTime() + 60 * 60 * 1000);
      const oooStart = new Date(testClock.getTime() + 3 * 60 * 60 * 1000);
      const oooEnd = new Date(oooStart.getTime() + 60 * 60 * 1000);

      adapter.setFreeBusyResponse("primary", [
        { start: busyStart, end: busyEnd, status: "busy" },
        { start: oooStart, end: oooEnd, status: "out-of-office" },
      ]);

      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-statuses",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-statuses");
      form.set("state", sealedState);
      const callbackResponse = await postCallback(form);
      expect(callbackResponse.status).toBe(200);

      const connectionRow = await getRequiredTestDb().execute<{
        access_token_encrypted: string;
      }>(
        `SELECT access_token_encrypted
         FROM calendar_connections
         WHERE id = '${GOOGLE_CONNECTION_ID}'`,
      );
      const accessToken = decryptCalendarToken({
        ciphertext: connectionRow.rows[0].access_token_encrypted,
        key: TOKEN_ENCRYPTION_KEY,
      });

      await runSyncForGoogleConnection({
        adapter,
        connectionId: GOOGLE_CONNECTION_ID,
        contributingCalendarIds: ["primary"],
        accessToken,
        userId: ALICE.id,
      });

      const intervals =
        await fetchBusyIntervalsWithStatus(GOOGLE_CONNECTION_ID);
      expect(intervals).toHaveLength(2);

      const statuses = intervals.map((i) => i.status).sort();
      expect(statuses).toEqual(["busy", "out-of-office"]);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "sync drops out-of-window busy intervals beyond the rolling 90-day window",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-window",
        refreshToken: "google-refresh-token-window",
      });

      const testClock = getTestClock()();
      const inWindowStart = new Date(testClock.getTime() + 2 * 60 * 60 * 1000);
      const inWindowEnd = new Date(inWindowStart.getTime() + 60 * 60 * 1000);
      const outOfWindowStart = new Date(
        testClock.getTime() + 100 * 24 * 60 * 60 * 1000,
      );
      const outOfWindowEnd = new Date(
        outOfWindowStart.getTime() + 60 * 60 * 1000,
      );

      adapter.setFreeBusyResponse("primary", [
        { start: inWindowStart, end: inWindowEnd, status: "busy" },
        { start: outOfWindowStart, end: outOfWindowEnd, status: "busy" },
      ]);

      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-window",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-window");
      form.set("state", sealedState);
      const callbackResponse = await postCallback(form);
      expect(callbackResponse.status).toBe(200);

      const connectionRow = await getRequiredTestDb().execute<{
        access_token_encrypted: string;
      }>(
        `SELECT access_token_encrypted
         FROM calendar_connections
         WHERE id = '${GOOGLE_CONNECTION_ID}'`,
      );
      const accessToken = decryptCalendarToken({
        ciphertext: connectionRow.rows[0].access_token_encrypted,
        key: TOKEN_ENCRYPTION_KEY,
      });

      await runSyncForGoogleConnection({
        adapter,
        connectionId: GOOGLE_CONNECTION_ID,
        contributingCalendarIds: ["primary"],
        accessToken,
        userId: ALICE.id,
      });

      const intervals =
        await fetchBusyIntervalsWithStatus(GOOGLE_CONNECTION_ID);
      expect(intervals).toHaveLength(1);
      const storedStartAt = new Date(intervals[0].start_at).getTime();
      expect(storedStartAt).toBe(inWindowStart.getTime());
    },
  );
});
