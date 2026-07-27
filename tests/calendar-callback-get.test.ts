import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET,
  resetCalendarOAuthCallbackRateLimitForTests,
} from "../app/me/calendar-connections/callback/route";
import { setSessionRepositoryForTests } from "../src/auth/session";
import { setCalendarConnectionRepositoryForTests } from "../src/calendar/repository";
import {
  sealCalendarConnectionState,
  type CalendarConnectionRecord,
} from "../src/calendar/connection";

function createSession() {
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

function newConnectionRecord(
  provider: "google" | "microsoft",
): CalendarConnectionRecord {
  return {
    id: `${provider}-connection-1`,
    userId: "user-1",
    provider,
    accountIdentifier: null,
    providerAccountKey: null,
    scopes:
      provider === "google"
        ? "https://www.googleapis.com/auth/calendar.freebusy"
        : "offline_access Calendars.ReadBasic",
    status: "pending",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    contributingCalendarIds: [],
  };
}

beforeEach(() => {
  resetCalendarOAuthCallbackRateLimitForTests();
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
  process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-client-id";
  process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "microsoft-client-secret";

  setSessionRepositoryForTests({
    findById: (sessionId) =>
      Promise.resolve(sessionId === "session-1" ? createSession() : null),
  });
});

afterEach(() => {
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

describe("GET /me/calendar-connections/callback", () => {
  it("completes a Google connection when the sealed state points at a google connection", async () => {
    const stored: CalendarConnectionRecord = newConnectionRecord("google");

    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: (id) =>
        Promise.resolve(id === stored.id ? { ...stored } : null),
      updateById: (id, patch) => {
        if (id !== stored.id) {
          return Promise.resolve(null);
        }
        Object.assign(stored, patch);
        return Promise.resolve({ ...stored });
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        expect(requestUrl).toBe("https://oauth2.googleapis.com/token");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "google-access",
              expires_in: 3600,
              refresh_token: "google-refresh",
              scope: "https://www.googleapis.com/auth/calendar.freebusy",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );

    const sealedState = await sealCalendarConnectionState({
      provider: "google",
      connectionId: stored.id,
      sessionId: "session-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      secret: "0123456789abcdef0123456789abcdef",
    });

    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("code", "google-code");
    url.searchParams.set("state", sealedState);

    const response = await GET(new Request(url.toString()));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=connected",
    );
  });

  it("redirects validated Microsoft denied consent to the denied outcome", async () => {
    const stored: CalendarConnectionRecord = newConnectionRecord("microsoft");

    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: (id) =>
        Promise.resolve(id === stored.id ? { ...stored } : null),
      updateById: (id, patch) => {
        if (id !== stored.id) return Promise.resolve(null);
        Object.assign(stored, patch);
        return Promise.resolve({ ...stored });
      },
    });

    const sealedState = await sealCalendarConnectionState({
      provider: "microsoft",
      connectionId: stored.id,
      sessionId: "session-1",
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      secret: "0123456789abcdef0123456789abcdef",
    });

    const url = new URL("http://localhost/me/calendar-connections/callback");
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("state", sealedState);

    const response = await GET(new Request(url.toString()));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=denied",
    );
  });

  it("rate limits callback attempts before state processing", async () => {
    let response: Response | null = null;
    for (let attempt = 0; attempt <= 30; attempt += 1) {
      response = await GET(
        new Request("http://localhost/me/calendar-connections/callback", {
          headers: {
            "x-forwarded-for": "192.0.2.44",
            "x-request-id": `rate-limit-${attempt}`,
          },
        }),
      );
    }

    expect(response?.status).toBe(303);
    expect(response?.headers.get("retry-after")).toBe("60");
    expect(response?.headers.get("location")).toBe(
      "http://localhost/me/calendar-connections?oauth=failed&requestId=rate-limit-30",
    );
  });
});
