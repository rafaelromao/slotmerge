import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "../app/me/calendar-connections/[id]/route";
import { GET } from "../app/me/calendar-connections/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import { encryptCalendarToken } from "../src/calendar/token-encryption";
import type { GoogleCalendarConnectionRecord } from "../src/calendar/google-calendar-connections";
import type { MicrosoftCalendarConnectionRecord } from "../src/calendar/microsoft-calendar-connections";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../src/calendar/repository";

describe("calendar connection management routes (Google + Microsoft)", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    setSessionRepositoryForTests(null);
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
  });

  it("lists queryable metadata for both Google and Microsoft providers without leaking tokens", async () => {
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

    const googleConnection: GoogleCalendarConnectionRecord = {
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
      contributingCalendarIds: [],
    };

    const microsoftConnection: MicrosoftCalendarConnectionRecord = {
      id: "microsoft-connection-1",
      userId: "user-1",
      provider: "microsoft",
      providerAccountKey: "microsoft:microsoft-connection-1",
      accountIdentifier: "microsoft:microsoft-connection-1",
      scopes: "offline_access Calendars.ReadBasic",
      status: "connected",
      refreshTokenEncrypted: "secret-microsoft-refresh",
      accessTokenEncrypted: "secret-microsoft-access",
      accessTokenExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };

    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([googleConnection]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });
    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([microsoftConnection]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await GET(
      new Request("http://localhost/me/calendar-connections", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      connections: Array<Record<string, unknown>>;
    };

    expect(body.connections).toHaveLength(2);
    const googleView = body.connections.find((c) => c.provider === "google");
    const microsoftView = body.connections.find(
      (c) => c.provider === "microsoft",
    );

    expect(googleView).toMatchObject({
      id: "google-connection-1",
      provider: "google",
      accountIdentifier: "google:google-connection-1",
      providerAccountKey: "google:google-connection-1",
      scopes: "https://www.googleapis.com/auth/calendar.freebusy",
      status: "connected",
      accessTokenExpiresAt: "2026-01-01T00:00:00.000Z",
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    expect(googleView).not.toHaveProperty("refreshTokenEncrypted");
    expect(googleView).not.toHaveProperty("accessTokenEncrypted");

    expect(microsoftView).toMatchObject({
      id: "microsoft-connection-1",
      provider: "microsoft",
      accountIdentifier: "microsoft:microsoft-connection-1",
      providerAccountKey: "microsoft:microsoft-connection-1",
      scopes: "offline_access Calendars.ReadBasic",
      status: "connected",
      accessTokenExpiresAt: "2026-02-01T00:00:00.000Z",
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    expect(microsoftView).not.toHaveProperty("refreshTokenEncrypted");
    expect(microsoftView).not.toHaveProperty("accessTokenEncrypted");
  });

  it("revokes a Microsoft calendar connection on PATCH and clears the encrypted tokens", async () => {
    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    const stored: MicrosoftCalendarConnectionRecord = {
      id: "microsoft-connection-1",
      userId: "user-1",
      provider: "microsoft",
      providerAccountKey: "microsoft:microsoft-connection-1",
      accountIdentifier: "microsoft:microsoft-connection-1",
      scopes: "offline_access Calendars.ReadBasic",
      status: "connected",
      refreshTokenEncrypted: encryptCalendarToken({
        plaintext: "microsoft-refresh-token-123",
        key: tokenEncryptionKey,
      }),
      accessTokenEncrypted: encryptCalendarToken({
        plaintext: "microsoft-access-token-123",
        key: tokenEncryptionKey,
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

    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    setMicrosoftCalendarConnectionRepositoryForTests({
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

        expect(requestUrl).toBe(
          "https://login.microsoftonline.com/organizations/oauth2/v2.0/logout",
        );
        return Promise.resolve(new Response(null, { status: 200 }));
      }),
    );

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await PATCH(
      new Request(
        "http://localhost/me/calendar-connections/microsoft-connection-1",
        {
          method: "PATCH",
          headers: {
            cookie,
            "x-csrf-token": "csrf-token-1",
          },
        },
      ),
      { params: Promise.resolve({ id: "microsoft-connection-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      connection: {
        id: "microsoft-connection-1",
        provider: "microsoft",
        accountIdentifier: "microsoft:microsoft-connection-1",
        providerAccountKey: "microsoft:microsoft-connection-1",
        scopes: "offline_access Calendars.ReadBasic",
        status: "disconnected",
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        contributingCalendarIds: [],
      },
    });
  });
});
