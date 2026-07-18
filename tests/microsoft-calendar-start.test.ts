import { describe, expect, it } from "vitest";

import { startCalendarConnection } from "../src/calendar/connection";
import { microsoftCalendarProvider } from "../src/calendar/providers";

describe("startCalendarConnection (Microsoft)", () => {
  it("creates a pending Microsoft connection with Calendars.ReadBasic scope and returns a work/school consent URL", async () => {
    const created: unknown[] = [];

    const result = await startCalendarConnection({
      provider: microsoftCalendarProvider,
      baseUrl: "https://slotmerge.example",
      clientId: "microsoft-client-id",
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
    expect(result.connection).toMatchObject({
      id: "connection-1",
      userId: "user-1",
      provider: "microsoft",
      providerAccountKey: "microsoft:connection-1",
      accountIdentifier: "microsoft:connection-1",
      status: "pending",
      scopes: "offline_access Calendars.ReadBasic",
    });
    expect(result.codeVerifier).not.toBe("");
    expect(result.state).not.toBe("");

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe("/organizations/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("microsoft-client-id");
    expect(url.searchParams.get("scope")).toBe(
      "offline_access Calendars.ReadBasic",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://slotmerge.example/me/calendar-connections/callback",
    );
  });
});
