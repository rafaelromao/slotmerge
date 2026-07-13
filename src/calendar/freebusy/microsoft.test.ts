import { describe, expect, it, vi } from "vitest";

import { fetchMicrosoftFreeBusy } from "./microsoft";

const FIXED_TIME_MIN = "2026-07-01T00:00:00Z";
const FIXED_TIME_MAX = "2026-07-02T00:00:00Z";

describe("fetchMicrosoftFreeBusy", () => {
  it("returns normalized busy intervals from Microsoft getSchedule API", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              scheduleId: "user@domain.com",
              availabilityView: "2",
              calendarEvents: [
                {
                  subject: "Busy meeting",
                  isBusy: true,
                  start: { dateTime: "2026-07-01T09:00:00Z", timeZone: "UTC" },
                  end: { dateTime: "2026-07-01T10:00:00Z", timeZone: "UTC" },
                },
                {
                  subject: "OOO",
                  isPrivate: false,
                  showAs: "oof",
                  start: { dateTime: "2026-07-01T12:00:00Z", timeZone: "UTC" },
                  end: { dateTime: "2026-07-01T13:00:00Z", timeZone: "UTC" },
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const intervals = await fetchMicrosoftFreeBusy({
      accessToken: "ey.aFakeToken",
      calendarIds: ["user@domain.com"],
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
    });

    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toMatchObject({
      providerCalendarId: "user@domain.com",
      status: "busy",
      startAt: new Date("2026-07-01T09:00:00Z"),
      endAt: new Date("2026-07-01T10:00:00Z"),
    });
    expect(intervals[1]).toMatchObject({
      providerCalendarId: "user@domain.com",
      status: "out-of-office",
      startAt: new Date("2026-07-01T12:00:00Z"),
      endAt: new Date("2026-07-01T13:00:00Z"),
    });

    const [url, reqInit] = mockFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
    );
    const body = JSON.parse(reqInit.body as string) as {
      schedules: string[];
      startTime: { dateTime: string; timeZone: string };
      endTime: { dateTime: string; timeZone: string };
    };
    expect(body.schedules).toEqual(["user@domain.com"]);
    expect(body.startTime.dateTime).toBe(FIXED_TIME_MIN);
    expect(body.endTime.dateTime).toBe(FIXED_TIME_MAX);
    expect(body.startTime.timeZone).toBe("UTC");
    expect(body.endTime.timeZone).toBe("UTC");
    expect(body.schedules).toEqual(["user@domain.com"]);
    expect(body.startTime.dateTime).toBe(FIXED_TIME_MIN);
    expect(body.endTime.dateTime).toBe(FIXED_TIME_MAX);
    expect(body.startTime.timeZone).toBe("UTC");
    expect(body.endTime.timeZone).toBe("UTC");
  });

  it("throws MicrosoftFreeBusyAuthError on 401", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      fetchMicrosoftFreeBusy({
        accessToken: "bad-token",
        calendarIds: ["user@domain.com"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("Microsoft authentication failed");
  });

  it("throws MicrosoftFreeBusyRateLimitError on 429 with Retry-After", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "retry-after": "60" },
      }),
    );

    await expect(
      fetchMicrosoftFreeBusy({
        accessToken: "ey.aFakeToken",
        calendarIds: ["user@domain.com"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });

  it("throws MicrosoftFreeBusyRateLimitError on 429 without Retry-After", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));

    await expect(
      fetchMicrosoftFreeBusy({
        accessToken: "ey.aFakeToken",
        calendarIds: ["user@domain.com"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: undefined });
  });

  it("throws MicrosoftFreeBusyServerError on 5xx", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      fetchMicrosoftFreeBusy({
        accessToken: "ey.aFakeToken",
        calendarIds: ["user@domain.com"],
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("Microsoft FreeBusy server error");
  });

  it("skips schedules absent from the response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const intervals = await fetchMicrosoftFreeBusy({
      accessToken: "ey.aFakeToken",
      calendarIds: ["user@domain.com"],
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
    });

    expect(intervals).toHaveLength(0);
  });

  it("maps tentative showAs to tentative status", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              scheduleId: "user@domain.com",
              availabilityView: "1",
              calendarEvents: [
                {
                  subject: "Tentative",
                  isBusy: false,
                  showAs: "tentative",
                  start: { dateTime: "2026-07-01T09:00:00Z", timeZone: "UTC" },
                  end: { dateTime: "2026-07-01T10:00:00Z", timeZone: "UTC" },
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const intervals = await fetchMicrosoftFreeBusy({
      accessToken: "ey.aFakeToken",
      calendarIds: ["user@domain.com"],
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
    });

    expect(intervals[0]).toMatchObject({
      status: "tentative",
    });
  });
});
