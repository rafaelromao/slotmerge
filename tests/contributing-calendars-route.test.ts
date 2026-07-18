import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "../app/me/calendar-connections/[id]/route";
import { GET as GET_CALENDARS } from "../app/me/calendar-connections/[id]/calendars/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import { encryptCalendarToken } from "../src/calendar/token-encryption";
import type { CalendarConnectionRecord } from "../src/calendar/connection";
import {
  setCalendarConnectionRepositoryForTests,
} from "../src/calendar/repository";

describe("contributing calendars selection", () => {
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

  describe("GET /me/calendar-connections/{id}/calendars", () => {
    it("returns the primary calendar for Google", async () => {
      const connection: CalendarConnectionRecord = {
        id: "google-connection-1",
        userId: "user-1",
        provider: "google",
        providerAccountKey: "google:google-connection-1",
        accountIdentifier: "google:google-connection-1",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "connected",
        refreshTokenEncrypted: encryptCalendarToken({
          plaintext: "google-refresh-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenEncrypted: encryptCalendarToken({
          plaintext: "google-access-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: ["primary"],
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
        listByUserId: () => Promise.resolve([connection]),
        findById: (id) =>
          Promise.resolve(id === connection.id ? { ...connection } : null),
        updateById: () => Promise.resolve(null),
      });

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await GET_CALENDARS(
        new Request(
          "http://localhost/me/calendar-connections/google-connection-1/calendars",
          {
            headers: { cookie },
          },
        ),
        { params: Promise.resolve({ id: "google-connection-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        calendars: [
          {
            id: "primary",
            name: "Primary Calendar",
            isPrimary: true,
            isIncluded: true,
          },
        ],
      });
    });

    it("returns calendars from Microsoft Graph with normalized isPrimary field", async () => {
      const connection: CalendarConnectionRecord = {
        id: "microsoft-connection-1",
        userId: "user-1",
        provider: "microsoft",
        providerAccountKey: "microsoft:microsoft-connection-1",
        accountIdentifier: "microsoft:microsoft-connection-1",
        scopes: "offline_access Calendars.ReadBasic",
        status: "connected",
        refreshTokenEncrypted: "secret-microsoft-refresh",
        accessTokenEncrypted: encryptCalendarToken({
          plaintext: "microsoft-access-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: ["calendar-1"],
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
        listByUserId: () => Promise.resolve([connection]),
        findById: (id) =>
          Promise.resolve(id === connection.id ? { ...connection } : null),
        updateById: () => Promise.resolve(null),
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

          if (
            requestUrl ===
            "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isPrimaryCalendar"
          ) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  value: [
                    {
                      id: "calendar-1",
                      name: "Work Calendar",
                      isPrimaryCalendar: true,
                    },
                    {
                      id: "calendar-2",
                      name: "Personal Calendar",
                      isPrimaryCalendar: false,
                    },
                  ],
                }),
                { status: 200 },
              ),
            );
          }
          return Promise.resolve(new Response(null, { status: 404 }));
        }),
      );

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await GET_CALENDARS(
        new Request(
          "http://localhost/me/calendar-connections/microsoft-connection-1/calendars",
          {
            headers: { cookie },
          },
        ),
        { params: Promise.resolve({ id: "microsoft-connection-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        calendars: [
          {
            id: "calendar-1",
            name: "Work Calendar",
            isPrimary: true,
            isIncluded: true,
          },
          {
            id: "calendar-2",
            name: "Personal Calendar",
            isPrimary: false,
            isIncluded: false,
          },
        ],
      });
    });

    it("returns 404 when connection does not exist", async () => {
      setSessionRepositoryForTests({
        findById: () =>
          Promise.resolve({
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
          }),
      });
      setCalendarConnectionRepositoryForTests({
        createPending: (record) => Promise.resolve(record),
        listByUserId: () => Promise.resolve([]),
        findById: () => Promise.resolve(null),
        updateById: () => Promise.resolve(null),
      });

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await GET_CALENDARS(
        new Request(
          "http://localhost/me/calendar-connections/nonexistent/calendars",
          {
            headers: { cookie },
          },
        ),
        { params: Promise.resolve({ id: "nonexistent" }) },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /me/calendar-connections/{id} with contributingCalendarIds", () => {
    it("updates contributing calendar IDs for Google", async () => {
      const stored: CalendarConnectionRecord = {
        id: "google-connection-1",
        userId: "user-1",
        provider: "google",
        providerAccountKey: "google:google-connection-1",
        accountIdentifier: "google:google-connection-1",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "connected",
        refreshTokenEncrypted: "secret-google-refresh",
        accessTokenEncrypted: "secret-google-access",
        accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: ["primary"],
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

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await PATCH(
        new Request(
          "http://localhost/me/calendar-connections/google-connection-1",
          {
            method: "PATCH",
            headers: {
              cookie,
              "x-csrf-token": "csrf-token-1",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contributingCalendarIds: ["primary", "another-cal"],
            }),
          },
        ),
        { params: Promise.resolve({ id: "google-connection-1" }) },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        connection: CalendarConnectionRecord;
      };
      expect(body.connection.contributingCalendarIds).toEqual([
        "primary",
        "another-cal",
      ]);
    });

    it("updates contributing calendar IDs for Microsoft", async () => {
      const stored: CalendarConnectionRecord = {
        id: "microsoft-connection-1",
        userId: "user-1",
        provider: "microsoft",
        providerAccountKey: "microsoft:microsoft-connection-1",
        accountIdentifier: "microsoft:microsoft-connection-1",
        scopes: "offline_access Calendars.ReadBasic",
        status: "connected",
        refreshTokenEncrypted: "secret-microsoft-refresh",
        accessTokenEncrypted: encryptCalendarToken({
          plaintext: "microsoft-access-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
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

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await PATCH(
        new Request(
          "http://localhost/me/calendar-connections/microsoft-connection-1",
          {
            method: "PATCH",
            headers: {
              cookie,
              "x-csrf-token": "csrf-token-1",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contributingCalendarIds: ["calendar-1", "calendar-2"],
            }),
          },
        ),
        { params: Promise.resolve({ id: "microsoft-connection-1" }) },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        connection: CalendarConnectionRecord;
      };
      expect(body.connection.contributingCalendarIds).toEqual([
        "calendar-1",
        "calendar-2",
      ]);
    });

    it("returns 400 for invalid contributingCalendarIds payload", async () => {
      const stored: CalendarConnectionRecord = {
        id: "google-connection-1",
        userId: "user-1",
        provider: "google",
        providerAccountKey: "google:google-connection-1",
        accountIdentifier: "google:google-connection-1",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "connected",
        refreshTokenEncrypted: "secret-google-refresh",
        accessTokenEncrypted: "secret-google-access",
        accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: ["primary"],
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
        updateById: () => Promise.resolve(null),
      });

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await PATCH(
        new Request(
          "http://localhost/me/calendar-connections/google-connection-1",
          {
            method: "PATCH",
            headers: {
              cookie,
              "x-csrf-token": "csrf-token-1",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ contributingCalendarIds: ["valid", 123] }),
          },
        ),
        { params: Promise.resolve({ id: "google-connection-1" }) },
      );

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent connection", async () => {
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
        listByUserId: () => Promise.resolve([]),
        findById: () => Promise.resolve(null),
        updateById: () => Promise.resolve(null),
      });

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await PATCH(
        new Request("http://localhost/me/calendar-connections/nonexistent", {
          method: "PATCH",
          headers: {
            cookie,
            "x-csrf-token": "csrf-token-1",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contributingCalendarIds: ["primary"] }),
        }),
        { params: Promise.resolve({ id: "nonexistent" }) },
      );

      expect(response.status).toBe(404);
    });

    it("disconnects on null body (backward compat)", async () => {
      const stored: CalendarConnectionRecord = {
        id: "google-connection-1",
        userId: "user-1",
        provider: "google",
        providerAccountKey: "google:google-connection-1",
        accountIdentifier: "google:google-connection-1",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "connected",
        refreshTokenEncrypted: encryptCalendarToken({
          plaintext: "refresh-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenEncrypted: encryptCalendarToken({
          plaintext: "access-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: ["primary"],
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
        new Request(
          "http://localhost/me/calendar-connections/google-connection-1",
          {
            method: "PATCH",
            headers: {
              cookie,
              "x-csrf-token": "csrf-token-1",
            },
          },
        ),
        { params: Promise.resolve({ id: "google-connection-1" }) },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        connection: CalendarConnectionRecord;
      };
      expect(body.connection.status).toBe("disconnected");
    });

    it("does not disconnect on empty object body", async () => {
      const stored: CalendarConnectionRecord = {
        id: "google-connection-1",
        userId: "user-1",
        provider: "google",
        providerAccountKey: "google:google-connection-1",
        accountIdentifier: "google:google-connection-1",
        scopes: "https://www.googleapis.com/auth/calendar.freebusy",
        status: "connected",
        refreshTokenEncrypted: encryptCalendarToken({
          plaintext: "refresh-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenEncrypted: encryptCalendarToken({
          plaintext: "access-token-123",
          key: "0123456789abcdef0123456789abcdef",
        }),
        accessTokenExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: ["primary"],
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
        updateById: () => Promise.resolve(null),
      });

      const cookie = await sealSessionCookie({ sessionId: "session-1" });
      const response = await PATCH(
        new Request(
          "http://localhost/me/calendar-connections/google-connection-1",
          {
            method: "PATCH",
            headers: {
              cookie,
              "x-csrf-token": "csrf-token-1",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          },
        ),
        { params: Promise.resolve({ id: "google-connection-1" }) },
      );

      expect(response.status).toBe(400);
    });
  });
});
