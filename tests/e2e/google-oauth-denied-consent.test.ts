import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

import { POST as COMPLETE_CONNECTION } from "../../app/me/calendar-connections/callback/route";
import { POST as START_CONNECTION } from "../../app/me/calendar-connections/google/connect/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { calendarConnections } from "../../src/db/schema";
import { listConnectionsForTests } from "../helpers/calendar-connection-tests";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb } from "../helpers/setup";
import { buildMockGoogleCalendarAdapter } from "../google-calendar-adapter";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = TEST_DB_URL !== undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const GOOGLE_CLIENT_ID = "google-client-id";
const TOKEN_ENCRYPTION_KEY = "abcdef0123456789abcdef0123456789";
const ALICE = USER_FIXTURES[0];
const SESSION = SESSION_FIXTURES[0];

function aliceSession() {
  return {
    user: {
      id: ALICE.id,
      email: ALICE.email,
      displayName: ALICE.displayName,
      avatarUrl: null,
      shortBio: null,
      role: ALICE.role,
      status: ALICE.status,
      profileTimezone: ALICE.profileTimezone,
      bufferMinutes: ALICE.bufferMinutes,
    },
    csrfToken: SESSION.csrfToken,
  };
}

async function sessionCookie(): Promise<string> {
  return sealSessionCookie({ sessionId: SESSION.id });
}

async function aliceCalendarConnections() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }

  return db
    .select({
      id: calendarConnections.id,
      provider: calendarConnections.provider,
      providerAccountKey: calendarConnections.providerAccountKey,
      accountIdentifier: calendarConnections.accountIdentifier,
      scopes: calendarConnections.scopes,
      status: calendarConnections.status,
      refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
      accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
      accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
      lastErrorCode: calendarConnections.lastErrorCode,
      lastErrorMessage: calendarConnections.lastErrorMessage,
      contributingCalendarIds: calendarConnections.contributingCalendarIds,
    })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, ALICE.id));
}

describe("E2E: denied Google OAuth consent leaves Calendar Connection pending", () => {
  let adapter: ReturnType<typeof buildMockGoogleCalendarAdapter>;

  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(getTestClock()());
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_CLIENT_ID;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(sessionId === SESSION.id ? aliceSession() : null),
    });
    adapter = buildMockGoogleCalendarAdapter();
    vi.stubGlobal("fetch", adapter.getFetchImpl());
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.SESSION_SECRET;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  it.runIf(HAS_TEST_DB)(
    "records consent denial without creating or completing a Calendar Connection",
    async () => {
      const cookie = await sessionCookie();
      const startResponse = await START_CONNECTION(
        new Request("http://localhost/me/calendar-connections/google/connect", {
          method: "POST",
          headers: {
            cookie,
            "x-csrf-token": SESSION.csrfToken,
          },
        }),
      );

      expect(startResponse.status).toBe(200);
      const startBody = (await startResponse.json()) as {
        authorizationUrl: string;
        connection: {
          id: string;
          provider: string;
          status: string;
        };
      };
      expect(startBody.connection).toMatchObject({
        provider: "google",
        status: "pending",
      });

      const state = new URL(startBody.authorizationUrl).searchParams.get(
        "state",
      );
      expect(state).toBeTruthy();
      if (!state) {
        throw new Error("Google authorization URL did not contain state");
      }

      const beforeCallback = await aliceCalendarConnections();

      const deniedRequest = adapter.buildDeniedConsentCallbackRequest({
        baseUrl: "http://localhost",
        errorDescription: "The user denied access.",
        state,
      });
      const callbackResponse = await COMPLETE_CONNECTION(deniedRequest);

      expect(callbackResponse.status).toBe(400);
      await expect(callbackResponse.json()).resolves.toEqual({
        error: "oauth_denied",
      });
      expect(adapter.denialCallbacks).toEqual([
        {
          error: "access_denied",
          errorDescription: "The user denied access.",
          state,
        },
      ]);
      expect(adapter.oauthCallbacks).toHaveLength(0);
      expect(adapter.freeBusyQueries).toHaveLength(0);

      const afterCallback = await aliceCalendarConnections();

      expect(afterCallback).toEqual(beforeCallback);
      const pendingConnection = afterCallback.find(
        (connection) => connection.id === startBody.connection.id,
      );
      expect(pendingConnection).toMatchObject({
        id: startBody.connection.id,
        provider: "google",
        status: "pending",
        refreshTokenEncrypted: null,
        accessTokenEncrypted: null,
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: [],
      });

      const listResponse = await listConnectionsForTests(ALICE.id);
      const matching = listResponse.connections.filter(
        (connection) => connection.id === startBody.connection.id,
      );
      expect(matching).toEqual([]);
      const pendingOrDisconnected = listResponse.connections.filter(
        (connection) => connection.id === startBody.connection.id,
      );
      expect(pendingOrDisconnected).toHaveLength(0);
    },
  );
});
