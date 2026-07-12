import { describe, expect, it } from "vitest";

import {
  buildMicrosoftCalendarAuthorizationUrl,
  getMicrosoftCalendarScopes,
} from "../src/calendar/microsoft-oauth";

describe("Microsoft Calendar OAuth", () => {
  it("returns the Calendars.ReadBasic scope string with offline_access", () => {
    expect(getMicrosoftCalendarScopes()).toBe(
      "offline_access Calendars.ReadBasic",
    );
  });

  it("builds a work/school-only consent URL on the Microsoft identity platform", () => {
    const authorizationUrl = buildMicrosoftCalendarAuthorizationUrl({
      baseUrl: "https://slotmerge.example",
      clientId: "microsoft-client-id",
      codeChallenge: "code-challenge",
      state: "sealed-state",
    });

    const url = new URL(authorizationUrl);

    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe("/organizations/oauth2/v2.0/authorize");
    expect(url.searchParams.get("client_id")).toBe("microsoft-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://slotmerge.example/me/calendar-connections/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("scope")).toBe(
      "offline_access Calendars.ReadBasic",
    );
    expect(url.searchParams.get("code_challenge")).toBe("code-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("sealed-state");
  });
});
