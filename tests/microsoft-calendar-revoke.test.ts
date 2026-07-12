import { describe, expect, it, vi } from "vitest";

import { encryptCalendarToken } from "../src/calendar/token-encryption";
import {
  revokeMicrosoftCalendarConnection,
  type MicrosoftCalendarConnectionRecord,
} from "../src/calendar/microsoft-calendar-connections";

describe("revokeMicrosoftCalendarConnection", () => {
  it("calls the Microsoft logout endpoint, sets status to disconnected, and clears encrypted tokens", async () => {
    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    const stored: MicrosoftCalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "microsoft",
      accountIdentifier: "microsoft:connection-1",
      providerAccountKey: "microsoft:connection-1",
      scopes: "offline_access Calendars.ReadBasic",
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
    };

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
    });

    const result = await revokeMicrosoftCalendarConnection({
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
    expect(result.accountIdentifier).toBe("microsoft:connection-1");
    expect(result.providerAccountKey).toBe("microsoft:connection-1");
    expect(result.refreshTokenEncrypted).toBeNull();
    expect(result.accessTokenEncrypted).toBeNull();
    expect(result.accessTokenExpiresAt).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tolerates a missing refresh token and still marks the connection disconnected", async () => {
    const tokenEncryptionKey = "0123456789abcdef0123456789abcdef";
    const stored: MicrosoftCalendarConnectionRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "microsoft",
      accountIdentifier: "microsoft:connection-1",
      providerAccountKey: "microsoft:connection-1",
      scopes: "offline_access Calendars.ReadBasic",
      status: "connected",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
    };

    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));

    const result = await revokeMicrosoftCalendarConnection({
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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
