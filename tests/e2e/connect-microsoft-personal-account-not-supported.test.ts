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
import { POST as START_CONNECTION } from "../../app/me/calendar-connections/microsoft/connect/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { calendarConnections } from "../../src/db/schema";
import { listConnectionsForTests } from "../helpers/calendar-connection-tests";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb } from "../helpers/setup";
import {
  buildMockMicrosoftGraphAdapter,
  type MockMicrosoftGraphAdapter,
} from "../mock-microsoft-graph-adapter";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = TEST_DB_URL !== undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "abcdef0123456789abcdef0123456789";
const MICROSOFT_CLIENT_ID = "microsoft-client-id";
const MICROSOFT_CLIENT_SECRET = "microsoft-client-secret";
const AUTHORIZATION_CODE = "personal-account-authorization-code";
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

describe("E2E: connect Microsoft personal account surfaces not-supported message", () => {
  let adapter: MockMicrosoftGraphAdapter;

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
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.MICROSOFT_OAUTH_CLIENT_ID = MICROSOFT_CLIENT_ID;
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = MICROSOFT_CLIENT_SECRET;
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(sessionId === SESSION.id ? aliceSession() : null),
    });
    adapter = buildMockMicrosoftGraphAdapter();
    adapter.setAccountKind("personal");
    vi.stubGlobal("fetch", adapter.getFetchImpl());
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "returns unsupported_microsoft_account error and does not persist a completed connection",
    async () => {
      const cookie = await sessionCookie();
      const startResponse = await START_CONNECTION(
        new Request(
          "http://localhost/me/calendar-connections/microsoft/connect",
          {
            method: "POST",
            headers: {
              cookie,
              "x-csrf-token": SESSION.csrfToken,
            },
          },
        ),
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
        provider: "microsoft",
        status: "pending",
      });

      const state = new URL(startBody.authorizationUrl).searchParams.get(
        "state",
      );
      expect(state).toBeTruthy();
      if (!state) {
        throw new Error("Microsoft authorization URL did not contain state");
      }

      const beforeCallback = await aliceCalendarConnections();

      const callbackBody = new FormData();
      callbackBody.set("code", AUTHORIZATION_CODE);
      callbackBody.set("state", state);
      const callbackResponse = await COMPLETE_CONNECTION(
        new Request("http://localhost/me/calendar-connections/callback", {
          method: "POST",
          body: callbackBody,
        }),
      );

      expect(callbackResponse.status).toBe(400);
      await expect(callbackResponse.json()).resolves.toEqual({
        error: "unsupported_microsoft_account",
      });

      expect(adapter.oauthCallbacks).toHaveLength(1);
      expect(adapter.oauthCallbacks[0].code).toBe(AUTHORIZATION_CODE);

      const afterCallback = await aliceCalendarConnections();
      expect(afterCallback).toEqual(beforeCallback);

      const pendingConnection = afterCallback.find(
        (connection) => connection.id === startBody.connection.id,
      );
      expect(pendingConnection).toMatchObject({
        id: startBody.connection.id,
        provider: "microsoft",
        status: "pending",
        refreshTokenEncrypted: null,
        accessTokenEncrypted: null,
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: [],
      });

      const listResponse = await listConnectionsForTests(ALICE.id);
      const matchingConnections = listResponse.connections.filter(
        (connection) => connection.id === startBody.connection.id,
      );
      expect(matchingConnections).toHaveLength(0);
      const unsupported = listResponse.connections.find(
        (connection) => connection.displayStatus === "unsupported",
      );
      expect(unsupported?.id).toBe(startBody.connection.id);
    },
  );
});
