import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";

import { POST as CONNECT } from "../../app/me/calendar-connections/google/connect/route";
import { POST as CALLBACK } from "../../app/me/calendar-connections/callback/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { decryptCalendarToken } from "../../src/calendar/token-encryption";
import { calendarConnections } from "../../src/db/schema";
import {
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";
import {
  SESSION_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const GOOGLE_CLIENT_ID = "google-client-id";
const GOOGLE_CLIENT_SECRET = "google-client-secret";
const ALICE_ID = USER_FIXTURES[0].id;
const SESSION_ID = SESSION_FIXTURES[0].id;
const CSRF_TOKEN = SESSION_FIXTURES[0].csrfToken;
const FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";

type ConnectResponse = {
  authorizationUrl: string;
  connection: { id: string; provider: string; status: string };
};

type CallbackResponse = {
  connection: {
    id: string;
    provider: string;
    status: string;
    scopes: string | null;
    accountIdentifier: string | null;
  };
};

function aliceSession() {
  return {
    user: {
      id: ALICE_ID,
      email: USER_FIXTURES[0].email,
      displayName: USER_FIXTURES[0].displayName,
      avatarUrl: null,
      shortBio: null,
      role: USER_FIXTURES[0].role,
      status: USER_FIXTURES[0].status,
      profileTimezone: USER_FIXTURES[0].profileTimezone,
      bufferMinutes: USER_FIXTURES[0].bufferMinutes,
    },
    csrfToken: CSRF_TOKEN,
  };
}

async function postConnect(): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
  return CONNECT(
    new Request("http://localhost/me/calendar-connections/google/connect", {
      method: "POST",
      headers: {
        cookie,
        "x-csrf-token": CSRF_TOKEN,
      },
    }),
  );
}

async function postCallback(state: string, code: string): Promise<Response> {
  const form = new FormData();
  form.set("code", code);
  form.set("state", state);
  return CALLBACK(
    new Request("http://localhost/me/calendar-connections/callback", {
      method: "POST",
      body: form,
    }),
  );
}

async function readConnectionRow(connectionId: string): Promise<{
  status: string;
  scopes: string | null;
  provider: string;
  refreshTokenEncrypted: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: string | null;
}> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{
    status: string;
    scopes: string | null;
    provider: string;
    refresh_token_encrypted: string | null;
    access_token_encrypted: string | null;
    access_token_expires_at: string | null;
  }>(
    `SELECT status, scopes, provider,
            refresh_token_encrypted, access_token_encrypted,
            access_token_expires_at
     FROM calendar_connections WHERE id = '${connectionId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("calendar connection row not found");
  }
  return {
    status: row.status,
    scopes: row.scopes,
    provider: row.provider,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    accessTokenEncrypted: row.access_token_encrypted,
    accessTokenExpiresAt: row.access_token_expires_at,
  };
}

function buildConnectFetch(
  adapter: MockGoogleCalendarAdapter,
  capturedUrls: string[],
): typeof fetch {
  return (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    capturedUrls.push(url);
    return adapter.getFetchImpl()(input, init);
  };
}

describe("E2E: connect Google Calendar with free/busy-only scopes", () => {
  let adapter: MockGoogleCalendarAdapter;
  let capturedUrls: string[];

  beforeEach(async () => {
    if (!HAS_TEST_DB) {
      return;
    }
    await setupTest();
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = GOOGLE_CLIENT_SECRET;
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;

    adapter = buildMockGoogleCalendarAdapter();
    capturedUrls = [];
    vi.stubGlobal("fetch", buildConnectFetch(adapter, capturedUrls));

    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
    });
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    vi.unstubAllGlobals();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "starts the connect flow with a calendar.freebusy consent URL and creates a pending row",
    async () => {
      const response = await postConnect();
      expect(response.status).toBe(200);
      const body = (await response.json()) as ConnectResponse;
      expect(body.connection.provider).toBe("google");
      expect(body.connection.status).toBe("pending");

      const url = new URL(body.authorizationUrl);
      expect(url.searchParams.get("scope")).toBe(FREEBUSY_SCOPE);
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe(GOOGLE_CLIENT_ID);
      expect(url.searchParams.get("redirect_uri")).toBe(
        "http://localhost/me/calendar-connections/callback",
      );

      const row = await readConnectionRow(body.connection.id);
      expect(row.status).toBe("pending");
      expect(row.provider).toBe("google");
      expect(row.scopes).toBe(FREEBUSY_SCOPE);
      expect(row.refreshTokenEncrypted).toBeNull();
      expect(row.accessTokenEncrypted).toBeNull();
      expect(row.accessTokenExpiresAt).toBeNull();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "completes the OAuth callback against the mock token endpoint and flips status to connected",
    async () => {
      const connectResponse = await postConnect();
      expect(connectResponse.status).toBe(200);
      const connectBody = (await connectResponse.json()) as ConnectResponse;

      const authUrl = new URL(connectBody.authorizationUrl);
      const state = authUrl.searchParams.get("state");
      expect(state).not.toBeNull();

      const callbackResponse = await postCallback(state ?? "", "auth-code-123");
      expect(callbackResponse.status).toBe(200);
      const callbackBody = (await callbackResponse.json()) as CallbackResponse;
      expect(callbackBody.connection.id).toBe(connectBody.connection.id);
      expect(callbackBody.connection.provider).toBe("google");
      expect(callbackBody.connection.status).toBe("connected");

      expect(adapter.oauthCallbacks).toHaveLength(1);
      const tokenExchange = adapter.oauthCallbacks[0];
      expect(tokenExchange.code).toBe("auth-code-123");
      expect(tokenExchange.codeVerifier).not.toBe("");
      expect(tokenExchange.codeVerifier.length).toBeGreaterThan(20);

      const capturedTokenUrl = capturedUrls.find(
        (u) => u === "https://oauth2.googleapis.com/token",
      );
      expect(capturedTokenUrl).toBe("https://oauth2.googleapis.com/token");
    },
  );
});