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
import { PATCH as PATCH_CONNECTION } from "../../app/me/calendar-connections/[id]/route";
import { GET as GET_CALENDARS } from "../../app/me/calendar-connections/[id]/calendars/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { decryptCalendarToken } from "../../src/calendar/token-encryption";
import { createPostgresImportedBusyIntervalRepository } from "../../src/calendar/imported-busy-intervals.repository";
import {
  clearInMemoryImportedBusyIntervalStore,
  getImportedBusyIntervalRepository,
  setImportedBusyIntervalRepositoryForTests,
} from "../../src/calendar/imported-busy-intervals";
import { syncCalendarConnection } from "../../src/calendar/sync";
import { googleCalendarProvider } from "../../src/calendar/providers";
import { sealCalendarConnectionState } from "../../src/calendar/connection";
import type { CalendarConnectionRecord } from "../../src/calendar/connection";
import { setCalendarConnectionRepositoryForTests } from "../../src/calendar/repository";
import { calendarConnections } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { getProfileByUserId } from "../../src/profile/repository";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import {
  createDefaultSearchSnapshotAssemblerDeps,
  SearchSnapshotAssembler,
} from "../../src/search/search-snapshot-assembler";
import {
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";
import {
  buildMockMicrosoftGraphAdapter,
  type MockMicrosoftGraphAdapter,
} from "../mock-microsoft-graph-adapter";
import { listConnectionsForTests } from "../helpers/calendar-connection-tests";
import {
  SESSION_FIXTURES,
  TOPIC_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE = USER_FIXTURES[0];
const ORGANIZER = USER_FIXTURES[1];
const SESSION = SESSION_FIXTURES[0];
const SELECTED_TOPIC = TOPIC_FIXTURES[0];

const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const GOOGLE_CONNECTION_ID = "00000000-0000-0000-0000-000000000091";
const MICROSOFT_CONNECTION_ID = "00000000-0000-0000-0000-000000000092";
const MICROSOFT_PRIMARY_CALENDAR_ID = "AAMkAGI2TGuLAAA=";

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

async function withCookie(requestInit: RequestInit = {}): Promise<RequestInit> {
  const cookie = await sealSessionCookie({ sessionId: SESSION.id });
  return {
    ...requestInit,
    headers: {
      ...(requestInit.headers ?? {}),
      cookie,
    },
  };
}

async function postCallback(form: FormData): Promise<Response> {
  return POST_CALLBACK(
    new Request("http://localhost/me/calendar-connections/callback", {
      method: "POST",
      body: form,
    }),
  );
}

async function listCalendarConnections(): Promise<{
  connections: Array<{
    id: string;
    provider: "google" | "microsoft";
    contributingCalendarIds: string[];
  }>;
}> {
  const result = await listConnectionsForTests(ALICE.id);
  return {
    connections: result.connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      contributingCalendarIds: c.calendars
        .filter((cal) => cal.selected)
        .map((cal) => cal.id),
    })),
  };
}

async function patchContributingCalendars(
  connectionId: string,
  calendarIds: string[],
): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION.id });
  return PATCH_CONNECTION(
    new Request(`http://localhost/me/calendar-connections/${connectionId}`, {
      method: "PATCH",
      headers: {
        cookie,
        "x-csrf-token": SESSION.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ contributingCalendarIds: calendarIds }),
    }),
    { params: Promise.resolve({ id: connectionId }) },
  );
}

async function fetchConnectionRow(
  connectionId: string,
): Promise<{ contributing_calendar_ids: string[] } | null> {
  const result = await getRequiredTestDb().execute<{
    contributing_calendar_ids: string[];
  }>(
    `SELECT contributing_calendar_ids
     FROM calendar_connections
     WHERE id = '${connectionId}'`,
  );
  return result.rows[0] ?? null;
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
      const rewritten = googleAdapterFetchWithUrlRewrite(adapter);
      return rewritten(input, init);
    }),
  );
}

function wireMicrosoftFetch(adapter: MockMicrosoftGraphAdapter): void {
  vi.stubGlobal("fetch", adapter.getFetchImpl());
}

async function runSyncForGoogleConnection(params: {
  adapter: MockGoogleCalendarAdapter;
  connectionId: string;
  contributingCalendarIds: string[];
  accessToken: string;
  userId: string;
}): Promise<void> {
  const fetchImpl = googleAdapterFetchWithUrlRewrite(params.adapter);
  const now = new Date();
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

async function seedPendingMicrosoftConnection(
  connectionId: string,
): Promise<void> {
  await getRequiredTestDb().execute(
    `INSERT INTO calendar_connections
      (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
      VALUES
        ('${connectionId}', '${ALICE.id}', 'microsoft', 'microsoft:${connectionId}', 'microsoft:${connectionId}', 'offline_access Calendars.ReadBasic', 'pending', '[]'::jsonb, NOW(), NOW())`,
  );
}

async function grantAliceDiscoverabilityConsent(): Promise<void> {
  await getRequiredTestDb().execute(
    `INSERT INTO discoverability_consents (user_id, granted_at)
     VALUES ('${ALICE.id}', NOW())
     ON CONFLICT (user_id) DO NOTHING`,
  );
}

async function seedAvailabilityWindowForAlice(): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM availability_windows WHERE user_id = '${ALICE.id}'`,
  );
  await getRequiredTestDb().execute(
    `INSERT INTO availability_windows
      (id, user_id, day_of_week, start_time, end_time, profile_timezone, created_at, updated_at)
      VALUES
        ('00000000-0000-0000-0000-000000000200', '${ALICE.id}', 0, '09:00', '23:00', 'America/New_York', NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000201', '${ALICE.id}', 1, '09:00', '23:00', 'America/New_York', NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000202', '${ALICE.id}', 2, '09:00', '23:00', 'America/New_York', NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000203', '${ALICE.id}', 3, '09:00', '23:00', 'America/New_York', NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000204', '${ALICE.id}', 4, '09:00', '23:00', 'America/New_York', NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000205', '${ALICE.id}', 5, '09:00', '23:00', 'America/New_York', NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000206', '${ALICE.id}', 6, '09:00', '23:00', 'America/New_York', NOW(), NOW())`,
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

describe("E2E: choose contributing calendars per connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(getTestClock()());
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-client-id";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "microsoft-client-secret";
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    setSessionRepositoryForTests(null);
    setImportedBusyIntervalRepositoryForTests(null);
    clearInMemoryImportedBusyIntervalStore();
    setCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
    await clearTestConnection(GOOGLE_CONNECTION_ID);
    await clearTestConnection(MICROSOFT_CONNECTION_ID);
  });

  it.runIf(HAS_TEST_DB)(
    "defaults Google connection to contributingCalendarIds=['primary'] after OAuth callback",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token",
        refreshToken: "google-refresh-token",
      });
      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-google-default",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-default");
      form.set("state", sealedState);

      const response = await postCallback(form);

      expect(response.status).toBe(200);
      const row = await fetchConnectionRow(GOOGLE_CONNECTION_ID);
      expect(row?.contributing_calendar_ids).toEqual(["primary"]);

      const { connections } = await listCalendarConnections();
      const ours = connections.find((c) => c.id === GOOGLE_CONNECTION_ID);
      expect(ours?.contributingCalendarIds).toEqual(["primary"]);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "defaults Microsoft connection to contributingCalendarIds=[primaryCalendarId] after OAuth callback",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingMicrosoftConnection(MICROSOFT_CONNECTION_ID);

      const adapter = buildMockMicrosoftGraphAdapter({
        accessToken: "microsoft-access-token",
        refreshToken: "microsoft-refresh-token",
        primaryCalendarId: MICROSOFT_PRIMARY_CALENDAR_ID,
      });
      wireMicrosoftFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: MICROSOFT_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-microsoft-default",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "microsoft-auth-code-default");
      form.set("state", sealedState);

      const response = await postCallback(form);

      expect(response.status).toBe(200);
      const row = await fetchConnectionRow(MICROSOFT_CONNECTION_ID);
      expect(row?.contributing_calendar_ids).toEqual([
        MICROSOFT_PRIMARY_CALENDAR_ID,
      ]);

      const { connections } = await listCalendarConnections();
      const ours = connections.find((c) => c.id === MICROSOFT_CONNECTION_ID);
      expect(ours?.contributingCalendarIds).toEqual([
        MICROSOFT_PRIMARY_CALENDAR_ID,
      ]);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "PATCH persists an additional calendar added to the selection",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-include",
        refreshToken: "google-refresh-token-include",
      });
      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-include",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-include");
      form.set("state", sealedState);
      const callbackResponse = await postCallback(form);
      expect(callbackResponse.status).toBe(200);

      const patchResponse = await patchContributingCalendars(
        GOOGLE_CONNECTION_ID,
        ["primary", "work"],
      );
      expect(patchResponse.status).toBe(200);

      const row = await fetchConnectionRow(GOOGLE_CONNECTION_ID);
      expect(row?.contributing_calendar_ids).toEqual(["primary", "work"]);

      const { connections } = await listCalendarConnections();
      const ours = connections.find((c) => c.id === GOOGLE_CONNECTION_ID);
      expect(ours?.contributingCalendarIds).toEqual(["primary", "work"]);

      const calendarsResponse = await GET_CALENDARS(
        new Request(
          `http://localhost/me/calendar-connections/${GOOGLE_CONNECTION_ID}/calendars`,
          await withCookie(),
        ),
        { params: Promise.resolve({ id: GOOGLE_CONNECTION_ID }) },
      );
      expect(calendarsResponse.status).toBe(200);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "PATCH persists a calendar removed from the selection",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-exclude",
        refreshToken: "google-refresh-token-exclude",
      });
      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-exclude",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-exclude");
      form.set("state", sealedState);
      const callbackResponse = await postCallback(form);
      expect(callbackResponse.status).toBe(200);

      const addResponse = await patchContributingCalendars(
        GOOGLE_CONNECTION_ID,
        ["primary", "work"],
      );
      expect(addResponse.status).toBe(200);

      const excludeResponse = await patchContributingCalendars(
        GOOGLE_CONNECTION_ID,
        ["primary"],
      );
      expect(excludeResponse.status).toBe(200);

      const row = await fetchConnectionRow(GOOGLE_CONNECTION_ID);
      expect(row?.contributing_calendar_ids).toEqual(["primary"]);

      const { connections } = await listCalendarConnections();
      const ours = connections.find((c) => c.id === GOOGLE_CONNECTION_ID);
      expect(ours?.contributingCalendarIds).toEqual(["primary"]);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "sync only requests contributing calendars and only imports their busy intervals",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-sync",
        refreshToken: "google-refresh-token-sync",
      });
      const primaryBusyStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const primaryBusyEnd = new Date(
        primaryBusyStart.getTime() + 60 * 60 * 1000,
      );
      adapter.setFreeBusyResponse("primary", [
        {
          start: primaryBusyStart,
          end: primaryBusyEnd,
          status: "busy",
        },
      ]);
      adapter.setFreeBusyResponse("work", [
        {
          start: primaryBusyStart,
          end: primaryBusyEnd,
          status: "busy",
        },
      ]);
      adapter.setFreeBusyResponse("personal", [
        {
          start: primaryBusyStart,
          end: primaryBusyEnd,
          status: "busy",
        },
      ]);

      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-sync",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-sync");
      form.set("state", sealedState);
      const callbackResponse = await postCallback(form);
      expect(callbackResponse.status).toBe(200);

      const patchResponse = await patchContributingCalendars(
        GOOGLE_CONNECTION_ID,
        ["primary", "work"],
      );
      expect(patchResponse.status).toBe(200);

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
        contributingCalendarIds: ["primary", "work"],
        accessToken,
        userId: ALICE.id,
      });

      expect(adapter.freeBusyQueries).toHaveLength(1);
      expect(adapter.freeBusyQueries[0].calendarIds).toEqual([
        "primary",
        "work",
      ]);
      expect(adapter.freeBusyQueries[0].calendarIds).not.toContain("personal");

      const intervals =
        await fetchBusyIntervalsForConnection(GOOGLE_CONNECTION_ID);
      const calendarIds = Array.from(
        new Set(intervals.map((row) => row.provider_calendar_id)),
      );
      expect(calendarIds.sort()).toEqual(["primary", "work"]);
      expect(calendarIds).not.toContain("personal");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "matching reflects only busy intervals from contributing calendars",
    async () => {
      await setupTest();
      wireTestRepositories();
      await seedAvailabilityWindowForAlice();
      await grantAliceDiscoverabilityConsent();
      await seedPendingGoogleConnection(GOOGLE_CONNECTION_ID);

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-match",
        refreshToken: "google-refresh-token-match",
      });

      const syncBusyStart = new Date(
        getTestClock()().getTime() + 2 * 60 * 60 * 1000,
      );
      const syncBusyEnd = new Date(syncBusyStart.getTime() + 60 * 60 * 1000);
      adapter.setFreeBusyResponse("primary", [
        {
          start: syncBusyStart,
          end: syncBusyEnd,
          status: "busy",
        },
      ]);
      adapter.setFreeBusyResponse("work", [
        {
          start: syncBusyStart,
          end: syncBusyEnd,
          status: "busy",
        },
      ]);

      wireGoogleFetch(adapter);

      const sealedState = await sealCalendarConnectionState({
        connectionId: GOOGLE_CONNECTION_ID,
        csrfToken: SESSION.csrfToken,
        codeVerifier: "code-verifier-match",
        secret: SESSION_SECRET,
      });
      const form = new FormData();
      form.set("code", "google-auth-code-match");
      form.set("state", sealedState);
      const callbackResponse = await postCallback(form);
      expect(callbackResponse.status).toBe(200);

      const patchResponse = await patchContributingCalendars(
        GOOGLE_CONNECTION_ID,
        ["primary", "work"],
      );
      expect(patchResponse.status).toBe(200);

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
        contributingCalendarIds: ["primary", "work"],
        accessToken,
        userId: ALICE.id,
      });

      setImportedBusyIntervalRepositoryForTests(
        createPostgresImportedBusyIntervalRepository(),
      );
      const slotStart = syncBusyStart;
      const slotEnd = syncBusyEnd;
      const matchedWithBoth = await runMatchingForSlot(
        slotStart,
        new Date(slotStart.getTime() - 60 * 60 * 1000),
        new Date(slotEnd.getTime() + 60 * 60 * 1000),
      );
      expect(matchedWithBoth).not.toContain(ALICE.id);

      const slotStartAfter = new Date(slotEnd.getTime() + 24 * 60 * 60 * 1000);
      const slotEndAfter = new Date(slotStartAfter.getTime() + 60 * 60 * 1000);
      const matchedWhenFree = await runMatchingForSlot(
        slotStartAfter,
        new Date(slotStartAfter.getTime() - 60 * 60 * 1000),
        new Date(slotStartAfter.getTime() + 2 * 60 * 60 * 1000),
      );
      expect(matchedWhenFree).toContain(ALICE.id);

      const dropResponse = await patchContributingCalendars(
        GOOGLE_CONNECTION_ID,
        ["primary"],
      );
      expect(dropResponse.status).toBe(200);

      await getImportedBusyIntervalRepository().deleteByConnectionIdAndCalendarId(
        GOOGLE_CONNECTION_ID,
        "work",
      );

      await runSyncForGoogleConnection({
        adapter,
        connectionId: GOOGLE_CONNECTION_ID,
        contributingCalendarIds: ["primary"],
        accessToken,
        userId: ALICE.id,
      });

      setImportedBusyIntervalRepositoryForTests(
        createPostgresImportedBusyIntervalRepository(),
      );

      const intervalsAfter =
        await fetchBusyIntervalsForConnection(GOOGLE_CONNECTION_ID);
      const calendarIdsAfter = Array.from(
        new Set(intervalsAfter.map((row) => row.provider_calendar_id)),
      );
      expect(calendarIdsAfter.sort()).toEqual(["primary"]);

      const matchedAfterPrimaryOnly = await runMatchingForSlot(
        slotStartAfter,
        new Date(slotStartAfter.getTime() - 60 * 60 * 1000),
        new Date(slotEndAfter.getTime() + 60 * 60 * 1000),
      );
      expect(matchedAfterPrimaryOnly).toContain(ALICE.id);
    },
  );
});

async function runMatchingForSlot(
  slotStart: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<string[]> {
  const assembler = new SearchSnapshotAssembler(
    createDefaultSearchSnapshotAssemblerDeps({
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      topicRepository: {
        listActive() {
          return Promise.resolve([
            {
              id: SELECTED_TOPIC.id,
              name: SELECTED_TOPIC.name,
              status: "active" as const,
            },
          ]);
        },
      },
      profileRepository: {
        findByUserId(uid) {
          return getProfileByUserId(uid);
        },
      },
    }),
  );
  const snapshot = await assembler.assemble({
    organizerId: ORGANIZER.id,
    selectedTopicIds: [SELECTED_TOPIC.id],
    durationMinutes: 60,
    dateRangeStart: rangeStart,
    dateRangeEnd: rangeEnd,
    organizerTimezone: "UTC",
    minimumMatchingUsers: 1,
    now: getTestClock()(),
  });
  const slotKey = slotStart.toISOString();
  const matched = new Set<string>();
  for (const slot of snapshot.slots) {
    if (slot.startUtc !== slotKey) continue;
    for (const match of slot.matches) {
      if (match.userId === ALICE.id) {
        matched.add(match.userId);
      }
    }
  }
  return Array.from(matched);
}
