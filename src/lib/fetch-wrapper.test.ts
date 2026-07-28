import { describe, expect, it, vi } from "vitest";

import { createProviderFetchImpl } from "./fetch-wrapper";

describe("createProviderFetchImpl", () => {
  it("routes a known provider endpoint to the local mock service", async () => {
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    const providerFetch = createProviderFetchImpl(
      baseFetch,
      "http://provider-mock:3001",
    );

    await providerFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
    });

    expect(baseFetch).toHaveBeenCalledWith(
      "http://provider-mock:3001/google/token",
      {
        method: "POST",
      },
    );
  });

  it("rejects an unknown provider URL before it can make a network request", async () => {
    const baseFetch = vi.fn<typeof fetch>();
    const providerFetch = createProviderFetchImpl(
      baseFetch,
      "http://provider-mock:3001",
    );

    await expect(
      providerFetch(
        "https://calendar.googleapis.com/calendar/v3/users/me/calendarList",
      ),
    ).rejects.toThrow("not allowed in offline mock mode");

    expect(baseFetch).not.toHaveBeenCalled();
  });
});
