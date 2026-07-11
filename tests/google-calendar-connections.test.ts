import { describe, expect, it, vi } from "vitest";

import {
  decryptCalendarToken,
  encryptCalendarToken,
} from "../src/calendar/token-encryption";
import {
  completeGoogleCalendarConnection,
  type GoogleCalendarConnectionRecord,
  revokeGoogleCalendarConnection,
  sealGoogleCalendarConnectionState,
  startGoogleCalendarConnection,
} from "../src/calendar/google-calendar-connections";

describe("Google calendar connection callback", () => {
  it("creates a pending connection and returns a freebusy-only consent URL", async () => {
    const created: Array<unknown> = [];

    const result = await startGoogleCalendarConnection({
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
    const stored: GoogleCalendarConnectionRecord = {
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

    const state = await sealGoogleCalendarConnectionState({
      connectionId: stored.id,
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      secret: "0123456789abcdef0123456789abcdef",
    });

    const result = await completeGoogleCalendarConnection({
      baseUrl: "https://slotmerge.example",
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      code: "auth-code-123",
      fetchImpl: fetchMock,
      repository: {
        createPending: (record) => Promise.resolve(record),
        listByUserId: () => Promise.resolve([]),
        findById: (id) => Promise.resolve(id === stored.id ? { ...stored } : null),
        updateById: (id, patch) => {
          if (id !== stored.id) {
            return Promise.resolve(null);
          }

          Object.assign(stored, patch);
          return Promise.resolve({ ...stored });
        },
      },
      state,
      tokenEncryptionKey: "0123456789abcdef0123456789abcdef",
    });

    expect(result.status).toBe("connected");
    expect(result.provider).toBe("google");
    expect(result.accountIdentifier).toBe("google:connection-1");
    expect(result.providerAccountKey).toBe("google:connection-1");
    expect(result.scopes).toBe("https://www.googleapis.com/auth/calendar.freebusy");
    expect(result.refreshTokenEncrypted).not.toBe("refresh-token-123");
    expect(result.accessTokenEncrypted).not.toBe("access-token-123");
    expect(
      decryptCalendarToken({
        ciphertext: result.refreshTokenEncrypted ?? "",
        key: "0123456789abcdef0123456789abcdef",
      }),
    ).toBe("refresh-token-123");
    expect(
      decryptCalendarToken({
        ciphertext: result.accessTokenEncrypted ?? "",
        key: "0123456789abcdef0123456789abcdef",
      }),
    ).toBe("access-token-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revokes the stored refresh token and clears encrypted tokens on disconnect", async () => {
    const stored: GoogleCalendarConnectionRecord = {
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

    const result = await revokeGoogleCalendarConnection({
      connectionId: stored.id,
      fetchImpl: fetchMock,
      repository: {
        createPending: (record) => Promise.resolve(record),
        listByUserId: () => Promise.resolve([]),
        findById: (id) => Promise.resolve(id === stored.id ? { ...stored } : null),
        updateById: (id, patch) => {
          if (id !== stored.id) {
            return Promise.resolve(null);
          }

          Object.assign(stored, patch);
          return Promise.resolve({ ...stored });
        },
      },
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
