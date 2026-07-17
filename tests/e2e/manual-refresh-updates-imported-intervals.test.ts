import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

vi.mock("../../src/worker/sync", () => ({
  enqueueSyncCalendarConnectionJob: vi.fn().mockResolvedValue(undefined),
}));

import { POST as POST_REFRESH } from "../../app/me/calendar-connections/[id]/refresh/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import {
  clearInMemoryImportedBusyIntervalStore,
  setImportedBusyIntervalRepositoryForTests,
} from "../../src/calendar/imported-busy-intervals";

import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../../src/calendar/repository";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";
import { systemRandomSource } from "../../src/system/random";
import {
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";
import {
  handleSyncCalendarConnectionJob,
  enqueueSyncCalendarConnectionJob,
} from "../../src/worker/sync";
import { encryptCalendarToken } from "../../src/calendar/token-encryption";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE = USER_FIXTURES[0];
const SESSION = SESSION_FIXTURES[0];
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

async function postRefresh(connectionId: string): Promise<Response> {
  const init = await withCookie({
    method: "POST",
    headers: {
      "x-csrf-token": SESSION.csrfToken,
    },
  });
  return POST_REFRESH(
    new Request(
      `http://localhost/me/calendar-connections/${connectionId}/refresh`,
      init,
    ),
    { params: Promise.resolve({ id: connectionId }) },
  );
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
      `INSERT INTO imported_busy_intervals
        (id, user_id, connection_id, provider_calendar_id, start_at, end_at, imported_at)
        VALUES
          (gen_random_uuid(), '${ALICE.id}', '${connectionId}', '${interval.providerCalendarId}', '${interval.startAt.toISOString()}', '${interval.endAt.toISOString()}', NOW())
        ON CONFLICT (connection_id, provider_calendar_id, start_at) DO NOTHING`,
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

describe("E2E: manual refresh updates imported intervals", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
  });

  afterEach(async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    setSessionRepositoryForTests(null);
    setImportedBusyIntervalRepositoryForTests(null);
    clearInMemoryImportedBusyIntervalStore();
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
    await clearTestConnection(GOOGLE_CONNECTION_ID);
  });

  it.runIf(HAS_TEST_DB)(
    "POST /me/calendar-connections/[id]/refresh enqueues a sync job for the connection",
    async () => {
      await setupTest();
      await seedConnectedGoogleConnection(
        GOOGLE_CONNECTION_ID,
        "google-access-token-1",
      );

      const response = await postRefresh(GOOGLE_CONNECTION_ID);

      expect(response.status).toBe(202);
      expect(vi.mocked(enqueueSyncCalendarConnectionJob)).toHaveBeenCalledTimes(
        1,
      );
      const [enqueuedConnectionId] = vi.mocked(enqueueSyncCalendarConnectionJob)
        .mock.calls[0] as [string, string];
      expect(enqueuedConnectionId).toBe(GOOGLE_CONNECTION_ID);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "sync job run after refresh produces updated busy intervals from the mock adapter",
    async () => {
      await setupTest();

      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "google-access-token-refresh",
        refreshToken: "google-refresh-token-refresh",
      });

      const oldBusyStart = new Date(getTestClock()());
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
        "google-access-token-refresh",
      );
      await upsertBusyIntervals(GOOGLE_CONNECTION_ID, [
        {
          providerCalendarId: "primary",
          startAt: oldBusyStart,
          endAt: oldBusyEnd,
        },
      ]);

      const newBusyStart = new Date(getTestClock()());
      const newBusyEnd = new Date(newBusyStart.getTime() + 2 * 60 * 60 * 1000);
      adapter.setFreeBusyResponse("primary", [
        {
          start: newBusyStart,
          end: newBusyEnd,
          status: "busy",
        },
      ]);

      await postRefresh(GOOGLE_CONNECTION_ID);

      vi.mocked(enqueueSyncCalendarConnectionJob).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        async (connectionId: string, _databaseUrl: string) => {
          await handleSyncCalendarConnectionJob(
            { connectionId },
            {
              clock: { now: getTestClock() },
              randomSource: systemRandomSource(),
            },
          );
        },
      );

      await postRefresh(GOOGLE_CONNECTION_ID);

      const intervals =
        await fetchBusyIntervalsForConnection(GOOGLE_CONNECTION_ID);
      const updatedInterval = intervals.find(
        (i) => new Date(i.start_at).getTime() === newBusyStart.getTime(),
      );
      expect(updatedInterval).toBeDefined();
      expect(new Date(updatedInterval!.end_at).getTime()).toBe(
        newBusyEnd.getTime(),
      );
    },
  );
});
