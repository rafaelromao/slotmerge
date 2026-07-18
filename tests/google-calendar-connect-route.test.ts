import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { POST } from "../app/me/calendar-connections/google/connect/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import { setCalendarConnectionRepositoryForTests } from "../src/calendar/repository";

describe("POST /me/calendar-connections/google/connect", () => {
  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.SESSION_SECRET;
    setSessionRepositoryForTests(null);
    setCalendarConnectionRepositoryForTests(null);
  });

  it("creates a pending Google calendar connection and returns a consent URL", async () => {
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
      new Request("http://localhost/me/calendar-connections/google/connect", {
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
      connection: { provider: string; status: string };
    };

    expect(body).toMatchObject({
      connection: {
        provider: "google",
        status: "pending",
      },
    });

    const url = new URL(body.authorizationUrl);
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.freebusy",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost/me/calendar-connections/callback",
    );
  });
});
