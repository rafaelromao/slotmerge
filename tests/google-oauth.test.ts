import { describe, expect, it } from "vitest";

import { buildGoogleCalendarAuthorizationUrl } from "../src/calendar/google-oauth";

describe("Google Calendar OAuth", () => {
  it("builds a consent URL limited to freebusy scope and the fixed callback path", () => {
    const authorizationUrl = buildGoogleCalendarAuthorizationUrl({
      baseUrl: "https://slotmerge.example",
      clientId: "google-client-id",
      codeChallenge: "code-challenge",
      state: "sealed-state",
    });

    const url = new URL(authorizationUrl);

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://slotmerge.example/me/calendar-connections/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.freebusy",
    );
    expect(url.searchParams.get("scope")).not.toContain("openid");
    expect(url.searchParams.get("scope")).not.toContain("email");
    expect(url.searchParams.get("scope")).not.toContain("profile");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(url.searchParams.get("code_challenge")).toBe("code-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("sealed-state");
  });
});
