import { describe, expect, it, vi } from "vitest";

import { createProviderFetchImpl } from "./fetch-wrapper";

describe("createProviderFetchImpl", () => {
  it.each([
    ["https://oauth2.googleapis.com/token", "/google/token"],
    ["https://oauth2.googleapis.com/revoke", "/google/revoke"],
    [
      "https://calendar.googleapis.com/calendar/v3/freeBusy",
      "/google/freebusy",
    ],
    [
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
      "/microsoft/token",
    ],
    [
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/logout",
      "/microsoft/logout",
    ],
    ["https://graph.microsoft.com/v1.0/me/calendars", "/microsoft/calendars"],
    [
      "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
      "/microsoft/getSchedule",
    ],
  ])("routes %s to the local mock service", async (endpoint, replacement) => {
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    const providerFetch = createProviderFetchImpl(
      baseFetch,
      "http://provider-mock:3001",
    );

    await providerFetch(endpoint, { method: "POST" });

    expect(baseFetch).toHaveBeenCalledWith(
      `http://provider-mock:3001${replacement}`,
      { method: "POST" },
    );
  });

  it.each([
    "https://calendar.googleapis.com/calendar/v3/users/me/calendarList",
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    "https://example.com/calendar",
  ])("rejects %s before it can make a network request", async (endpoint) => {
    const baseFetch = vi.fn<typeof fetch>();
    const providerFetch = createProviderFetchImpl(
      baseFetch,
      "http://provider-mock:3001",
    );

    await expect(providerFetch(endpoint)).rejects.toThrow(
      "not allowed in offline mock mode",
    );

    expect(baseFetch).not.toHaveBeenCalled();
  });
});
