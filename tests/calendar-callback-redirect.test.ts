import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/me/calendar-connections/callback/route";
import { setSessionRepositoryForTests } from "../src/auth/session";
import {
  sealCalendarConnectionState,
  type CalendarConnectionRecord,
} from "../src/calendar/connection";
import { setCalendarConnectionRepositoryForTests } from "../src/calendar/repository";

function session() {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      shortBio: null,
      role: "user" as const,
      status: "active" as const,
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken: "csrf-token-1",
  };
}

function pendingConnection(
  overrides: Partial<CalendarConnectionRecord> = {},
): CalendarConnectionRecord {
  return {
    id: "connection-1",
    userId: "user-1",
    provider: "google",
    providerAccountKey: null,
    accountIdentifier: null,
    scopes: "https://www.googleapis.com/auth/calendar.freebusy",
    status: "pending",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    contributingCalendarIds: [],
    ...overrides,
  };
}

function installRepository(stored: CalendarConnectionRecord): void {
  setCalendarConnectionRepositoryForTests({
    createPending: (record) => Promise.resolve(record),
    listByUserId: () => Promise.resolve([]),
    findById: (id) => Promise.resolve(id === stored.id ? { ...stored } : null),
    updateById: (id, patch) => {
      if (id !== stored.id) return Promise.resolve(null);
      Object.assign(stored, patch);
      return Promise.resolve({ ...stored });
    },
    claimPending: ({ id, userId, provider }) => {
      if (
        id !== stored.id ||
        userId !== stored.userId ||
        provider !== stored.provider ||
        stored.status !== "pending"
      ) {
        return Promise.resolve(null);
      }
      stored.status = "disconnected";
      return Promise.resolve({ ...stored });
    },
  });
}

async function stateFor(
  stored: CalendarConnectionRecord,
  overrides: { sessionId?: string; csrfToken?: string } = {},
): Promise<string> {
  return sealCalendarConnectionState({
    provider: stored.provider,
    connectionId: stored.id,
    sessionId: overrides.sessionId ?? "session-1",
    csrfToken: overrides.csrfToken ?? "csrf-token-1",
    codeVerifier: "code-verifier-1",
    issuedAt: new Date("2026-07-12T12:00:00.000Z"),
    expiresAt: new Date("2026-07-12T12:05:00.000Z"),
    secret: process.env.SESSION_SECRET ?? "",
  });
}

describe("GET /me/calendar-connections/callback redirect outcomes", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.FIXTURE_DATE = "2026-07-12T12:00:00.000Z";
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    setSessionRepositoryForTests({
      findById: (id) => Promise.resolve(id === "session-1" ? session() : null),
    });
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.FIXTURE_DATE;
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    setSessionRepositoryForTests(null);
    setCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
  });

  it("validates and consumes a Google callback before redirecting to connected", async () => {
    const stored = pendingConnection();
    installRepository(stored);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            access_token: "google-access",
            refresh_token: "google-refresh",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.freebusy",
          }),
        ),
      ),
    );
    const state = await stateFor(stored);
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "google-code");
    url.searchParams.set("state", state);

    const response = await GET(new Request(url));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=connected",
    );
    expect(response.headers.get("location")).not.toContain("google-code");
    expect(response.headers.get("location")).not.toContain(state);
    expect(stored.status).toBe("connected");
    expect(stored.contributingCalendarIds).toEqual(["primary"]);
  });

  it("consumes validated denied consent and redirects without provider details", async () => {
    const stored = pendingConnection();
    installRepository(stored);
    const state = await stateFor(stored);
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "provider internal detail");
    url.searchParams.set("state", state);

    const response = await GET(new Request(url));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=denied",
    );
    expect(response.headers.get("location")).not.toContain("provider");
    expect(response.headers.get("location")).not.toContain(state);
    expect(stored.status).toBe("disconnected");
  });

  it("redirects a validated Microsoft personal-account completion to unsupported", async () => {
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-client-id";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "microsoft-client-secret";
    const stored = pendingConnection({
      provider: "microsoft",
      scopes: "offline_access Calendars.ReadBasic",
    });
    installRepository(stored);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              error: "access_denied",
              error_description: "Personal accounts are not supported.",
            },
            { status: 400 },
          ),
        ),
      ),
    );
    const state = await stateFor(stored);
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "microsoft-personal-code");
    url.searchParams.set("state", state);

    const response = await GET(new Request(url));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=unsupported",
    );
    expect(stored.status).toBe("unsupported");
  });

  it("redirects malformed callbacks to failed with only the request ID", async () => {
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "provider-secret-code");

    const response = await GET(
      new Request(url, { headers: { "x-request-id": "request-123" } }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=failed&requestId=request-123",
    );
    expect(response.headers.get("location")).not.toContain(
      "provider-secret-code",
    );
  });

  it("exchanges a pending OAuth attempt at most once", async () => {
    const stored = pendingConnection();
    installRepository(stored);
    const tokenExchange = vi.fn(() =>
      Promise.resolve(
        Response.json({
          access_token: "google-access",
          refresh_token: "google-refresh",
          expires_in: 3600,
        }),
      ),
    );
    vi.stubGlobal("fetch", tokenExchange);
    const state = await stateFor(stored);
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "google-code");
    url.searchParams.set("state", state);

    const first = await GET(new Request(url));
    const replay = await GET(
      new Request(url, { headers: { "x-request-id": "replay-request" } }),
    );

    expect(first.headers.get("location")).toContain("oauth=connected");
    expect(replay.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=failed&requestId=replay-request",
    );
    expect(tokenExchange).toHaveBeenCalledTimes(1);
  });

  it("rejects an expired state before consuming the pending connection", async () => {
    const stored = pendingConnection();
    installRepository(stored);
    const state = await sealCalendarConnectionState({
      provider: "google",
      connectionId: stored.id,
      sessionId: "session-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      issuedAt: new Date("2026-07-12T11:50:00.000Z"),
      expiresAt: new Date("2026-07-12T11:55:00.000Z"),
      secret: process.env.SESSION_SECRET ?? "",
    });
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "google-code");
    url.searchParams.set("state", state);

    const response = await GET(
      new Request(url, { headers: { "x-request-id": "expired-request" } }),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=failed&requestId=expired-request",
    );
    expect(stored.status).toBe("pending");
  });

  it("rejects a state whose CSRF hash no longer matches the active session", async () => {
    const stored = pendingConnection();
    installRepository(stored);
    const state = await stateFor(stored, { csrfToken: "stale-csrf-token" });
    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "google-code");
    url.searchParams.set("state", state);

    const response = await GET(
      new Request(url, { headers: { "x-request-id": "csrf-request" } }),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=failed&requestId=csrf-request",
    );
    expect(stored.status).toBe("pending");
  });
});
