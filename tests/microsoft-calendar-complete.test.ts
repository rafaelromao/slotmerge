import { describe, expect, it, vi } from "vitest";

import { decryptCalendarToken } from "../src/calendar/token-encryption";
import {
  completeMicrosoftCalendarConnection,
  type MicrosoftCalendarConnectionRecord,
  sealMicrosoftCalendarConnectionState,
} from "../src/calendar/microsoft-calendar-connections";

describe("completeMicrosoftCalendarConnection", () => {
  it("exchanges the code with PKCE, encrypts tokens, and flips the connection to connected", async () => {
    const stored: MicrosoftCalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "microsoft",
      accountIdentifier: null,
      providerAccountKey: null,
      scopes: "offline_access Calendars.ReadBasic",
      status: "pending",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
    };

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

      expect(requestUrl).toBe(
        "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
      );
      expect(bodyText).toContain("grant_type=authorization_code");
      expect(bodyText).toContain("code=auth-code-123");
      expect(bodyText).toContain("client_id=microsoft-client-id");
      expect(bodyText).toContain("client_secret=microsoft-client-secret");
      expect(bodyText).toContain("code_verifier=code-verifier-1");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "access-token-123",
            expires_in: 3600,
            refresh_token: "refresh-token-123",
            scope: "offline_access Calendars.ReadBasic",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });

    const sessionSecret = "0123456789abcdef0123456789abcdef";
    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    const state = await sealMicrosoftCalendarConnectionState({
      connectionId: stored.id,
      csrfToken: "csrf-token-1",
      codeVerifier: "code-verifier-1",
      secret: sessionSecret,
    });

    const result = await completeMicrosoftCalendarConnection({
      baseUrl: "https://slotmerge.example",
      clientId: "microsoft-client-id",
      clientSecret: "microsoft-client-secret",
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
      sessionSecret,
      state,
      tokenEncryptionKey,
    });

    expect(result.status).toBe("connected");
    expect(result.provider).toBe("microsoft");
    expect(result.accountIdentifier).toBe("microsoft:connection-1");
    expect(result.providerAccountKey).toBe("microsoft:connection-1");
    expect(result.scopes).toBe("offline_access Calendars.ReadBasic");
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
});
