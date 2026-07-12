import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { POST } from "../app/me/calendar-connections/microsoft/connect/route";
import { sealSessionCookie, setSessionRepositoryForTests } from "../src/auth/session";
import { setMicrosoftCalendarConnectionRepositoryForTests } from "../src/calendar/repository";

describe("POST /me/calendar-connections/microsoft/connect", () => {
  beforeEach(() => {
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-client-id";
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.SESSION_SECRET;
    setSessionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
  });

  it("creates a pending Microsoft calendar connection and returns a work/school consent URL", async () => {
    const created: Array<unknown> = [];

    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });
    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => {
        created.push(record);
        return Promise.resolve(record);
      },
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await POST(
      new Request("http://localhost/me/calendar-connections/microsoft/connect", {
        method: "POST",
        headers: {
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(created).toHaveLength(1);
    const body = (await response.json()) as {
      authorizationUrl: string;
      connection: { provider: string; status: string; scopes: string };
    };

    expect(body).toMatchObject({
      connection: {
        provider: "microsoft",
        status: "pending",
        scopes: "offline_access Calendars.ReadBasic",
      },
    });

    const url = new URL(body.authorizationUrl);
    expect(url.searchParams.get("scope")).toBe(
      "offline_access Calendars.ReadBasic",
    );
    expect(url.pathname).toBe("/organizations/oauth2/v2.0/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost/me/calendar-connections/callback",
    );
  });

  it("returns 401 when the request is unauthenticated", async () => {
    setSessionRepositoryForTests({
      findById: () => Promise.resolve(null),
    });

    const response = await POST(
      new Request("http://localhost/me/calendar-connections/microsoft/connect", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthenticated" });
  });

  it("returns 403 when the CSRF token is invalid", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await POST(
      new Request("http://localhost/me/calendar-connections/microsoft/connect", {
        method: "POST",
        headers: {
          cookie,
          "x-csrf-token": "wrong-csrf-token",
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_csrf" });
  });

  it("returns 500 when the Microsoft OAuth client id is missing", async () => {
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await POST(
      new Request("http://localhost/me/calendar-connections/microsoft/connect", {
        method: "POST",
        headers: {
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "microsoft_oauth_not_configured",
    });
  });
});
