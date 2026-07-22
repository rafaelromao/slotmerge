import { createHash } from "node:crypto";

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
import { decryptCalendarToken } from "../../src/calendar/token-encryption";
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
const MICROSOFT_SCOPES = "offline_access Calendars.ReadBasic";
const ACCESS_TOKEN = "work-school-access-token";
const REFRESH_TOKEN = "work-school-refresh-token";
const PRIMARY_CALENDAR_ID = "work-school-primary-calendar";
const AUTHORIZATION_CODE = "work-school-authorization-code";
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

describe("E2E: connect Microsoft work/school calendar with Calendars.ReadBasic", () => {
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
    adapter = buildMockMicrosoftGraphAdapter({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      primaryCalendarId: PRIMARY_CALENDAR_ID,
    });
    adapter.setAccountKind("work-school");
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
    "completes delegated PKCE auth, encrypts tokens, records the scope, and exposes status metadata",
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
          scopes: string;
          status: string;
        };
      };
      expect(startBody.connection).toMatchObject({
        provider: "microsoft",
        scopes: MICROSOFT_SCOPES,
        status: "pending",
      });

      const authorizationUrl = new URL(startBody.authorizationUrl);
      expect(authorizationUrl.origin).toBe("https://login.microsoftonline.com");
      expect(authorizationUrl.pathname).toBe(
        "/organizations/oauth2/v2.0/authorize",
      );
      expect(authorizationUrl.searchParams.get("scope")).toBe(MICROSOFT_SCOPES);
      expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );
      const codeChallenge = authorizationUrl.searchParams.get("code_challenge");
      const state = authorizationUrl.searchParams.get("state");
      expect(codeChallenge).toBeTruthy();
      expect(state).toBeTruthy();
      if (!codeChallenge || !state) {
        throw new Error(
          "Microsoft authorization URL did not contain PKCE state",
        );
      }

      const callbackBody = new FormData();
      callbackBody.set("code", AUTHORIZATION_CODE);
      callbackBody.set("state", state);
      const callbackResponse = await COMPLETE_CONNECTION(
        new Request("http://localhost/me/calendar-connections/callback", {
          method: "POST",
          body: callbackBody,
        }),
      );

      expect(callbackResponse.status).toBe(200);
      const callbackResult = (await callbackResponse.json()) as {
        connection: {
          id: string;
          provider: string;
          scopes: string;
          status: string;
          contributingCalendarIds: string[];
        };
      };
      expect(callbackResult.connection).toMatchObject({
        id: startBody.connection.id,
        provider: "microsoft",
        scopes: MICROSOFT_SCOPES,
        status: "connected",
        contributingCalendarIds: [PRIMARY_CALENDAR_ID],
      });

      expect(adapter.oauthCallbacks).toHaveLength(1);
      expect(adapter.oauthCallbacks[0]).toMatchObject({
        code: AUTHORIZATION_CODE,
        scope: MICROSOFT_SCOPES,
      });
      expect(
        createHash("sha256")
          .update(adapter.oauthCallbacks[0].codeVerifier)
          .digest("base64url"),
      ).toBe(codeChallenge);
      expect(adapter.primaryCalendarCalls).toHaveLength(1);

      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        throw new Error("test db not initialized");
      }
      const [stored] = await db
        .select({
          provider: calendarConnections.provider,
          scopes: calendarConnections.scopes,
          status: calendarConnections.status,
          accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
          refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
          accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
          contributingCalendarIds: calendarConnections.contributingCalendarIds,
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.id, startBody.connection.id))
        .limit(1);

      expect(stored).toBeDefined();
      expect(stored).toMatchObject({
        provider: "microsoft",
        scopes: MICROSOFT_SCOPES,
        status: "connected",
        contributingCalendarIds: [PRIMARY_CALENDAR_ID],
      });
      expect(stored.accessTokenEncrypted).not.toBe(ACCESS_TOKEN);
      expect(stored.refreshTokenEncrypted).not.toBe(REFRESH_TOKEN);
      expect(stored.accessTokenExpiresAt).toBeInstanceOf(Date);
      expect(
        decryptCalendarToken({
          ciphertext: stored.accessTokenEncrypted ?? "",
          key: TOKEN_ENCRYPTION_KEY,
        }),
      ).toBe(ACCESS_TOKEN);
      expect(
        decryptCalendarToken({
          ciphertext: stored.refreshTokenEncrypted ?? "",
          key: TOKEN_ENCRYPTION_KEY,
        }),
      ).toBe(REFRESH_TOKEN);

      const listResponse = await listConnectionsForTests(ALICE.id);
      const matchingConnections = listResponse.connections.filter(
        (connection) => connection.id === startBody.connection.id,
      );
      expect(matchingConnections).toHaveLength(1);
      const listed = matchingConnections[0];
      expect(listed).toMatchObject({
        id: startBody.connection.id,
        provider: "microsoft",
        displayStatus: "connected",
        stale: true,
        lastSyncAt: null,
      });
      expect(listed).not.toHaveProperty("accessTokenEncrypted");
      expect(listed).not.toHaveProperty("refreshTokenEncrypted");
      expect(listed).not.toHaveProperty("refreshToken");
    },
  );
});
