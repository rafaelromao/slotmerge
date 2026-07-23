import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../app/me/calendar-connections/connect/google/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import type { CalendarConnectionRecord } from "../src/calendar/connection";
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

describe("POST /me/calendar-connections/connect/google", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.APP_PUBLIC_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://test";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.APP_PUBLIC_URL;
    delete process.env.DATABASE_URL;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.SESSION_SECRET;
    setSessionRepositoryForTests(null);
    setCalendarConnectionRepositoryForTests(null);
  });

  it("creates a pending Calendar Connection and 303 redirects to Google", async () => {
    const created: CalendarConnectionRecord[] = [];
    setSessionRepositoryForTests({
      findById: (id) => Promise.resolve(id === "session-1" ? session() : null),
    });
    setCalendarConnectionRepositoryForTests({
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
      new Request(
        "http://localhost:3000/me/calendar-connections/connect/google",
        {
          method: "POST",
          headers: {
            cookie,
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-origin",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ _csrf: "csrf-token-1" }),
        },
      ),
    );

    expect(response.status).toBe(303);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: "user-1",
      provider: "google",
      status: "pending",
    });
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const authorizeUrl = new URL(location ?? "");
    expect(authorizeUrl.hostname).toBe("accounts.google.com");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/me/calendar-connections/callback",
    );
  });

  it("replaces an owned connection and redirects with state bound to the active session", async () => {
    const replacements: Array<{
      previousId: string;
      userId: string;
      provider: string;
      pending: CalendarConnectionRecord;
    }> = [];
    setSessionRepositoryForTests({
      findById: (id) => Promise.resolve(id === "session-1" ? session() : null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: () =>
        Promise.reject(new Error("unexpected direct create")),
      replaceWithPending: (input) => {
        replacements.push(input);
        return Promise.resolve(input.pending);
      },
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });
    const cookie = await sealSessionCookie({ sessionId: "session-1" });

    const response = await POST(
      new Request(
        "http://localhost:3000/me/calendar-connections/connect/google",
        {
          method: "POST",
          headers: {
            cookie,
            origin: "http://localhost:3000",
            "sec-fetch-site": "same-origin",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            connectionId: "connection-to-replace",
          }),
        },
      ),
    );

    expect(response.status).toBe(303);
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      previousId: "connection-to-replace",
      userId: "user-1",
      provider: "google",
      pending: { userId: "user-1", provider: "google", status: "pending" },
    });
  });
});
