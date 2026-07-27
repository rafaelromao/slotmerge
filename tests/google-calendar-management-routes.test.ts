import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "../app/me/calendar-connections/[id]/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import { encryptCalendarToken } from "../src/calendar/token-encryption";
import type { CalendarConnectionRecord } from "../src/calendar/connection";
import { setCalendarConnectionRepositoryForTests } from "../src/calendar/repository";
import { listConnectionsForTests } from "./helpers/calendar-connection-tests";

describe("calendar connection management routes", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    setSessionRepositoryForTests(null);
    setCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
  });

  it("lists only queryable connection metadata", async () => {
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
    const connection: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      providerAccountKey: "google:connection-1",
      accountIdentifier: "google:connection-1",
      scopes: "https://www.googleapis.com/auth/calendar.freebusy",
      status: "connected",
      refreshTokenEncrypted: "secret-refresh",
      accessTokenEncrypted: "secret-access",
      accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };

    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([connection]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    const { connections } = await listConnectionsForTests("user-1");

    expect(connections).toEqual([
      {
        id: "connection-1",
        provider: "google",
        accountIdentifier: "google:connection-1",
        displayStatus: "connected",
        lastSyncAt: null,
        stale: true,
        calendars: [],
        calendarsError: false,
      },
    ]);
  });

  it("revokes the stored refresh token on disconnect and leaves metadata queryable", async () => {
    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    const stored: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      providerAccountKey: "google:connection-1",
      accountIdentifier: "google:connection-1",
      scopes: "https://www.googleapis.com/auth/calendar.freebusy",
      status: "connected",
      refreshTokenEncrypted: encryptCalendarToken({
        plaintext: "refresh-token-123",
        key: tokenEncryptionKey,
      }),
      accessTokenEncrypted: encryptCalendarToken({
        plaintext: "access-token-123",
        key: tokenEncryptionKey,
      }),
      accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };

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
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([stored]),
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

        expect(requestUrl).toBe("https://oauth2.googleapis.com/revoke");
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await PATCH(
      new Request("http://localhost/me/calendar-connections/connection-1", {
        method: "PATCH",
        headers: {
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
      }),
      { params: Promise.resolve({ id: "connection-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      connection: {
        id: "connection-1",
        provider: "google",
        accountIdentifier: "google:connection-1",
        providerAccountKey: "google:connection-1",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "disconnected",
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSyncAt: null,
        contributingCalendarIds: [],
      },
    });
  });
});
