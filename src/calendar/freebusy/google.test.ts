import { describe, expect, it, vi } from "vitest";

import { fetchGoogleFreeBusy } from "./google";

const FIXED_TIME_MIN = "2026-07-01T00:00:00Z";
const FIXED_TIME_MAX = "2026-07-02T00:00:00Z";

describe("fetchGoogleFreeBusy", () => {
  it("returns normalized busy intervals from Google FreeBusy API", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: {
            "primary": {
              busy: [
                { start: "2026-07-01T09:00:00Z", end: "2026-07-01T10:00:00Z" },
                { start: "2026-07-01T14:00:00Z", end: "2026-07-01T15:30:00Z" },
              ],
              outOfOffice: [
                { start: "2026-07-01T12:00:00Z", end: "2026-07-01T13:00:00Z" },
              ],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const intervals = await fetchGoogleFreeBusy({
      accessToken: "ya1.aFakeToken",
      calendarIds: ["primary"],
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
    });

    expect(intervals).toHaveLength(3);
    expect(intervals[0]).toMatchObject({
      providerCalendarId: "primary",
      status: "busy",
      startAt: new Date("2026-07-01T09:00:00Z"),
      endAt: new Date("2026-07-01T10:00:00Z"),
    });
    expect(intervals[1]).toMatchObject({
      providerCalendarId: "primary",
      status: "busy",
      startAt: new Date("2026-07-01T14:00:00Z"),
      endAt: new Date("2026-07-01T15:30:00Z"),
    });
    expect(intervals[2]).toMatchObject({
      providerCalendarId: "primary",
      status: "out-of-office",
      startAt: new Date("2026-07-01T12:00:00Z"),
      endAt: new Date("2026-07-01T13:00:00Z"),
    });

    const [url, reqInit] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://calendar.googleapis.com/calendar/v3/freeBusy");
    const body = JSON.parse(reqInit.body as string) as { timeMin: string; timeMax: string; items: Array<{ id: string }> };
    expect(body.timeMin).toBe(FIXED_TIME_MIN);
    expect(body.timeMax).toBe(FIXED_TIME_MAX);
    expect(body.items).toEqual([{ id: "primary" }]);
  });

  it("throws GoogleFreeBusyAuthError on 401", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(
      fetchGoogleFreeBusy({
        accessToken: "bad-token",
        calendarIds: ["primary"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("Google authentication failed");
  });

  it("throws GoogleFreeBusyRateLimitError on 429 with Retry-After", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    );

    await expect(
      fetchGoogleFreeBusy({
        accessToken: "ya1.aFakeToken",
        calendarIds: ["primary"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: 30 });
  });

  it("throws GoogleFreeBusyRateLimitError on 429 without Retry-After", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 429 }),
    );

    await expect(
      fetchGoogleFreeBusy({
        accessToken: "ya1.aFakeToken",
        calendarIds: ["primary"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: undefined });
  });

  it("throws GoogleFreeBusyServerError on 5xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    await expect(
      fetchGoogleFreeBusy({
        accessToken: "ya1.aFakeToken",
        calendarIds: ["primary"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("Google FreeBusy server error");
  });

  it("skips calendars absent from the response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ calendars: {} }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const intervals = await fetchGoogleFreeBusy({
      accessToken: "ya1.aFakeToken",
      calendarIds: ["primary", "secondary"],
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
    });

    expect(intervals).toHaveLength(0);
  });

  it("returns empty intervals for a calendar with no busy blocks", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: {
            primary: { busy: [], outOfOffice: [] },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const intervals = await fetchGoogleFreeBusy({
      accessToken: "ya1.aFakeToken",
      calendarIds: ["primary"],
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
    });

    expect(intervals).toHaveLength(0);
  });
});
