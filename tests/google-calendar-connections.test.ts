import { describe, expect, it, vi } from "vitest";

import {
  completeCalendarConnection,
  revokeCalendarConnection,
  sealCalendarConnectionState,
  startCalendarConnection,
  type CalendarConnectionRecord,
  type CalendarConnectionRepository,
} from "../src/calendar/connection";
import {
  getCalendarProvider,
  googleCalendarProvider,
} from "../src/calendar/providers";
import type { CalendarProvider } from "../src/calendar/provider";
import {
  decryptCalendarToken,
  encryptCalendarToken,
} from "../src/calendar/token-encryption";

describe("Calendar Connection lifecycle", () => {
  it("resolves protocol-correct providers from one registry", () => {
    const google = getCalendarProvider("google");
    const microsoft = getCalendarProvider("microsoft");

    expect(google.id).toBe("google");
    expect(google.accountIdPrefix).toBe("google");
    expect(
      google.buildAuthorizationUrl({
        baseUrl: "https://slotmerge.example",
        clientId: "google-client",
        codeChallenge: "challenge",
        state: "state",
      }),
    ).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(microsoft.id).toBe("microsoft");
    expect(microsoft.accountIdPrefix).toBe("microsoft");
    expect(
      microsoft.buildAuthorizationUrl({
        baseUrl: "https://slotmerge.example",
        clientId: "microsoft-client",
        codeChallenge: "challenge",
        state: "state",
      }),
    ).toContain(
      "login.microsoftonline.com/organizations/oauth2/v2.0/authorize",
    );
  });

  it("completes a connection through a provider and encrypts its tokens", async () => {
    const stored: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      providerAccountKey: "google:connection-1",
      accountIdentifier: "google:connection-1",
      scopes: "scope",
      status: "pending",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };
    const repository: CalendarConnectionRepository = {
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([stored]),
      findById: (id) =>
        Promise.resolve(id === stored.id ? { ...stored } : null),
      updateById: (id, patch) => {
        if (id !== stored.id) return Promise.resolve(null);
        Object.assign(stored, patch);
        return Promise.resolve({ ...stored });
      },
    };
    const provider: CalendarProvider = {
      id: "google",
      accountIdPrefix: "google",
      authorizationScopes: "scope",
      buildAuthorizationUrl: () => "https://provider.example/authorize",
      completeAuthorization: () =>
        Promise.resolve({
          kind: "connected",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accessTokenExpiresAt: new Date("2026-01-01T01:00:00.000Z"),
          scopes: "scope",
          contributingCalendarIds: ["primary"],
        }),
      revoke: () => Promise.resolve(),
      fetchFreeBusy: () => Promise.resolve([]),
    };
    const sessionSecret = "0123456789abcdef0123456789abcdef";
    const tokenEncryptionKey = "abcdef0123456789abcdef0123456789";
    const state = await sealCalendarConnectionState({
      provider: provider.id,
      connectionId: stored.id,
      sessionId: "session-1",
      csrfToken: "csrf-token",
      codeVerifier: "code-verifier",
      secret: sessionSecret,
    });

    const result = await completeCalendarConnection({
      provider,
      repository,
      baseUrl: "https://slotmerge.example",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code",
      fetchImpl: vi.fn(),
      sessionSecret,
      state,
      tokenEncryptionKey,
    });

    expect(result.status).toBe("connected");
    if (result.status !== "connected") throw new Error("expected connected");
    expect(result.connection).toMatchObject({
      provider: "google",
      status: "connected",
      contributingCalendarIds: ["primary"],
    });
    expect(
      decryptCalendarToken({
        ciphertext: result.connection.accessTokenEncrypted ?? "",
        key: tokenEncryptionKey,
      }),
    ).toBe("access-token");
  });

  it("persists an expected unsupported completion", async () => {
    const stored: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "microsoft",
      providerAccountKey: "microsoft:connection-1",
      accountIdentifier: "microsoft:connection-1",
      scopes: "scope",
      status: "pending",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };
    const provider: CalendarProvider = {
      id: "microsoft",
      accountIdPrefix: "microsoft",
      authorizationScopes: "scope",
      buildAuthorizationUrl: () => "https://provider.example/authorize",
      completeAuthorization: () =>
        Promise.resolve({
          kind: "unsupported",
          reason: "unsupported_microsoft_account",
        }),
      revoke: () => Promise.resolve(),
      fetchFreeBusy: () => Promise.resolve([]),
    };
    const repository: CalendarConnectionRepository = {
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([stored]),
      findById: () => Promise.resolve({ ...stored }),
      updateById: (id, patch) => {
        if (id !== stored.id) return Promise.resolve(null);
        Object.assign(stored, patch);
        return Promise.resolve({ ...stored });
      },
    };
    const sessionSecret = "0123456789abcdef0123456789abcdef";
    const state = await sealCalendarConnectionState({
      provider: provider.id,
      connectionId: stored.id,
      sessionId: "session-1",
      csrfToken: "csrf-token",
      codeVerifier: "code-verifier",
      secret: sessionSecret,
    });

    const result = await completeCalendarConnection({
      provider,
      repository,
      baseUrl: "https://slotmerge.example",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code",
      fetchImpl: vi.fn(),
      sessionSecret,
      state,
      tokenEncryptionKey: "abcdef0123456789abcdef0123456789",
    });

    expect(result).toMatchObject({
      status: "unsupported",
      reason: "unsupported_microsoft_account",
      connection: { status: "unsupported", provider: "microsoft" },
    });
    expect(stored.status).toBe("unsupported");
  });

  it("propagates unexpected provider completion failures", async () => {
    const stored: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      providerAccountKey: "google:connection-1",
      accountIdentifier: "google:connection-1",
      scopes: "scope",
      status: "pending",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };
    const failure = new Error("provider unavailable");
    const provider: CalendarProvider = {
      id: "google",
      accountIdPrefix: "google",
      authorizationScopes: "scope",
      buildAuthorizationUrl: () => "https://provider.example/authorize",
      completeAuthorization: () => Promise.reject(failure),
      revoke: () => Promise.resolve(),
      fetchFreeBusy: () => Promise.resolve([]),
    };
    const sessionSecret = "0123456789abcdef0123456789abcdef";
    const state = await sealCalendarConnectionState({
      provider: provider.id,
      connectionId: stored.id,
      sessionId: "session-1",
      csrfToken: "csrf-token",
      codeVerifier: "code-verifier",
      secret: sessionSecret,
    });

    await expect(
      completeCalendarConnection({
        provider,
        repository: {
          createPending: (record) => Promise.resolve(record),
          listByUserId: () => Promise.resolve([stored]),
          findById: () => Promise.resolve({ ...stored }),
          updateById: () => Promise.resolve(null),
        },
        baseUrl: "https://slotmerge.example",
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "code",
        fetchImpl: vi.fn(),
        sessionSecret,
        state,
        tokenEncryptionKey: "abcdef0123456789abcdef0123456789",
      }),
    ).rejects.toBe(failure);
  });

  it("starts a pending connection through a provider", async () => {
    const records: CalendarConnectionRecord[] = [];
    const repository: CalendarConnectionRepository = {
      createPending: (record) => {
        records.push(record);
        return Promise.resolve(record);
      },
      listByUserId: () => Promise.resolve(records),
      findById: (id) =>
        Promise.resolve(records.find((record) => record.id === id) ?? null),
      updateById: () => Promise.resolve(null),
    };
    const provider: CalendarProvider = {
      id: "microsoft",
      accountIdPrefix: "microsoft",
      authorizationScopes: "offline_access Calendars.ReadBasic",
      buildAuthorizationUrl: ({ state }) =>
        `https://provider.example/authorize?state=${state}`,
      completeAuthorization: () => {
        throw new Error("not used");
      },
      revoke: () => Promise.resolve(),
      fetchFreeBusy: () => Promise.resolve([]),
    };

    const result = await startCalendarConnection({
      provider,
      repository,
      baseUrl: "https://slotmerge.example",
      clientId: "client-id",
      csrfToken: "csrf-token",
      generateId: () => "connection-1",
      sessionSecret: "0123456789abcdef0123456789abcdef",
      userId: "user-1",
    });

    expect(records).toEqual([
      expect.objectContaining({
        id: "connection-1",
        provider: "microsoft",
        providerAccountKey: "microsoft:connection-1",
        status: "pending",
      }),
    ]);
    expect(result.authorizationUrl).toContain("provider.example/authorize");
    expect(result.state).not.toBe("");
  });
});

describe("Google calendar connection callback", () => {
  it("creates a pending connection and returns a freebusy-only consent URL", async () => {
    const created: Array<unknown> = [];

    const result = await startCalendarConnection({
      provider: googleCalendarProvider,
      baseUrl: "https://slotmerge.example",
      clientId: "google-client-id",
      csrfToken: "csrf-token-1",
      generateId: () => "connection-1",
      repository: {
        createPending: (record) => {
          created.push(record);
          return Promise.resolve(record);
        },
        listByUserId: () => Promise.resolve([]),
        findById: () => Promise.resolve(null),
        updateById: () => Promise.resolve(null),
      },
      sessionSecret: "0123456789abcdef0123456789abcdef",
      userId: "user-1",
    });

    expect(created).toHaveLength(1);
    expect(result.connection.id).toBe("connection-1");
    expect(result.connection.userId).toBe("user-1");
    expect(result.connection.status).toBe("pending");
    expect(result.connection.providerAccountKey).toBe("google:connection-1");
    expect(result.connection.accountIdentifier).toBe("google:connection-1");
    expect(result.connection.scopes).toBe(
      "https://www.googleapis.com/auth/calendar.freebusy",
    );
    expect(result.state).not.toBe("");

    const url = new URL(result.authorizationUrl);
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.freebusy",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://slotmerge.example/me/calendar-connections/callback",
    );
  });

  it("stores encrypted tokens and opaque plain metadata without calling identity endpoints", async () => {
    const stored: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      accountIdentifier: null,
      providerAccountKey: null,
      scopes: null,
      status: "pending",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
            access_token: "access-token-123",
            expires_in: 3600,
            refresh_token: "refresh-token-123",
            scope: "https://www.googleapis.com/auth/calendar.freebusy",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });

    const sessionSecret = "session-secret-32-characters!!!!";
    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    const state = await sealCalendarConnectionState({
      connectionId: stored.id,
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      secret: sessionSecret,
    });

    const completed = await completeCalendarConnection({
      provider: getCalendarProvider("google"),
      repository: {
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
      },
      baseUrl: "https://slotmerge.example",
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      code: "auth-code-123",
      fetchImpl: fetchMock,
      sessionSecret,
      state,
      tokenEncryptionKey,
    });

    expect(completed.status).toBe("connected");
    if (completed.status !== "connected") throw new Error("expected connected");
    const result = completed.connection;
    expect(result.provider).toBe("google");
    expect(result.accountIdentifier).toBe("google:connection-1");
    expect(result.providerAccountKey).toBe("google:connection-1");
    expect(result.scopes).toBe(
      "https://www.googleapis.com/auth/calendar.freebusy",
    );
    expect(result.contributingCalendarIds).toEqual(["primary"]);
    expect(result.refreshTokenEncrypted).not.toBe("refresh-token-123");
    expect(result.accessTokenEncrypted).not.toBe("access-token-123");
    expect(
      decryptCalendarToken({
        ciphertext: result.refreshTokenEncrypted ?? "",
        key: tokenEncryptionKey,
      }),
    ).toBe("refresh-token-123");
    expect(
      decryptCalendarToken({
        ciphertext: result.accessTokenEncrypted ?? "",
        key: tokenEncryptionKey,
      }),
    ).toBe("access-token-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revokes the stored refresh token and clears encrypted tokens on disconnect", async () => {
    const stored: CalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      accountIdentifier: "google:connection-1",
      providerAccountKey: "google:connection-1",
      scopes: "https://www.googleapis.com/auth/calendar.freebusy",
      status: "connected",
      refreshTokenEncrypted: "",
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: [],
    };

    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    stored.refreshTokenEncrypted = encryptCalendarToken({
      plaintext: "refresh-token-123",
      key: tokenEncryptionKey,
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const bodyText =
        typeof init?.body === "string"
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : "";

      expect(requestUrl).toBe("https://oauth2.googleapis.com/revoke");
      expect(bodyText).toContain("refresh-token-123");
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    const result = await revokeCalendarConnection({
      provider: getCalendarProvider("google"),
      repository: {
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
      },
      connectionId: stored.id,
      fetchImpl: fetchMock,
      tokenEncryptionKey,
    });

    expect(result.status).toBe("disconnected");
    expect(result.accountIdentifier).toBe("google:connection-1");
    expect(result.providerAccountKey).toBe("google:connection-1");
    expect(result.refreshTokenEncrypted).toBeNull();
    expect(result.accessTokenEncrypted).toBeNull();
    expect(result.accessTokenExpiresAt).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
