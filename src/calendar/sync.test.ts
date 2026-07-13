import { describe, expect, it, vi } from "vitest";

import { syncCalendarConnection, RateLimitError, ServerError } from "./sync";
import type { ImportedBusyIntervalRecord } from "./imported-busy-intervals";

const fixedNow = new Date("2026-07-12T12:00:00.000Z");

const FIXED_TIME_MIN = "2026-07-01T00:00:00Z";
const FIXED_TIME_MAX = "2026-07-02T00:00:00Z";

describe("syncCalendarConnection", () => {
  it("early-returns (no-op) when contributingCalendarIds is empty", async () => {
    const upsertBatch = vi.fn();

    await syncCalendarConnection({
      connectionId: "conn-1",
      provider: "google",
      accessToken: "fake-token",
      contributingCalendarIds: [],
      userId: "user-1",
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: fetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
        deleteByConnectionIdAndCalendarId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure: vi.fn(),
      clock: () => fixedNow,
    });

    expect(upsertBatch).not.toHaveBeenCalled();
  });

  it("calls upsertBatch with intervals from Google FreeBusy API", async () => {
    const upsertBatch = vi.fn();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: [
                { start: "2026-07-01T09:00:00Z", end: "2026-07-01T10:00:00Z" },
              ],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await syncCalendarConnection({
      connectionId: "conn-seeded-test",
      provider: "google",
      accessToken: "ya1.aFakeToken",
      contributingCalendarIds: ["primary"],
      userId: "user-1",
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
        deleteByConnectionIdAndCalendarId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure: vi.fn(),
      clock: () => fixedNow,
    });

    expect(upsertBatch).toHaveBeenCalledTimes(1);
    const [intervals] = upsertBatch.mock.calls[0] as [
      ImportedBusyIntervalRecord[],
    ];
    expect(intervals.length).toBe(1);
    expect(intervals[0]?.connectionId).toBe("conn-seeded-test");
    expect(intervals[0]?.userId).toBe("user-1");
    expect(intervals[0]?.providerCalendarId).toBe("primary");
    expect(intervals[0]?.status).toBe("busy");
    expect(intervals[0]?.importedAt).toEqual(fixedNow);
  });

  it("calls upsertBatch with intervals from Microsoft getSchedule API", async () => {
    const upsertBatch = vi.fn();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              scheduleId: "user@domain.com",
              availabilityView: "2",
              calendarEvents: [
                {
                  subject: "Busy",
                  isBusy: true,
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

    await syncCalendarConnection({
      connectionId: "conn-ms",
      provider: "microsoft",
      accessToken: "ey.aFakeToken",
      contributingCalendarIds: ["user@domain.com"],
      userId: "user-2",
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
        deleteByConnectionIdAndCalendarId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure: vi.fn(),
      clock: () => fixedNow,
    });

    expect(upsertBatch).toHaveBeenCalledTimes(1);
    const [intervals] = upsertBatch.mock.calls[0] as [
      ImportedBusyIntervalRecord[],
    ];
    expect(intervals[0]?.providerCalendarId).toBe("user@domain.com");
    expect(intervals[0]?.status).toBe("busy");
  });

  it("calls recordFailure with AUTH_ERROR on 401", async () => {
    const upsertBatch = vi.fn();
    const recordFailure = vi.fn();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await syncCalendarConnection({
      connectionId: "conn-auth",
      provider: "google",
      accessToken: "bad-token",
      contributingCalendarIds: ["primary"],
      userId: "user-1",
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
        deleteByConnectionIdAndCalendarId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure,
      clock: () => fixedNow,
    });

    expect(upsertBatch).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith({
      code: "AUTH_ERROR",
      message: "Google authentication failed",
    });
  });

  it("throws RateLimitError on 429 with Retry-After", async () => {
    const upsertBatch = vi.fn();
    const recordFailure = vi.fn();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    );

    await expect(
      syncCalendarConnection({
        connectionId: "conn-rate",
        provider: "google",
        accessToken: "ya1.aFakeToken",
        contributingCalendarIds: ["primary"],
        userId: "user-1",
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
        busyIntervalRepository: {
          upsertBatch,
          deleteByConnectionId: vi.fn(),
          deleteByConnectionIdAndCalendarId: vi.fn(),
          findByUserIdAndDateRange: vi.fn(),
          deleteExpiredBefore: vi.fn(),
        },
        recordFailure,
        clock: () => fixedNow,
      }),
    ).rejects.toMatchObject({ retryAfterMs: 30_000 });

    expect(upsertBatch).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("throws RateLimitError on 429 without Retry-After", async () => {
    const upsertBatch = vi.fn();
    const recordFailure = vi.fn();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 429 }));

    await expect(
      syncCalendarConnection({
        connectionId: "conn-rate",
        provider: "google",
        accessToken: "ya1.aFakeToken",
        contributingCalendarIds: ["primary"],
        userId: "user-1",
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
        busyIntervalRepository: {
          upsertBatch,
          deleteByConnectionId: vi.fn(),
          deleteByConnectionIdAndCalendarId: vi.fn(),
          findByUserIdAndDateRange: vi.fn(),
          deleteExpiredBefore: vi.fn(),
        },
        recordFailure,
        clock: () => fixedNow,
      }),
    ).rejects.toMatchObject({ retryAfterMs: undefined });

    expect(upsertBatch).not.toHaveBeenCalled();
  });

  it("throws ServerError on 5xx", async () => {
    const upsertBatch = vi.fn();
    const recordFailure = vi.fn();

    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      syncCalendarConnection({
        connectionId: "conn-server",
        provider: "google",
        accessToken: "ya1.aFakeToken",
        contributingCalendarIds: ["primary"],
        userId: "user-1",
        timeMin: FIXED_TIME_MIN,
        timeMax: FIXED_TIME_MAX,
        fetchImpl: mockFetch,
        busyIntervalRepository: {
          upsertBatch,
          deleteByConnectionId: vi.fn(),
          deleteByConnectionIdAndCalendarId: vi.fn(),
          findByUserIdAndDateRange: vi.fn(),
          deleteExpiredBefore: vi.fn(),
        },
        recordFailure,
        clock: () => fixedNow,
      }),
    ).rejects.toBeInstanceOf(ServerError);

    expect(upsertBatch).not.toHaveBeenCalled();
  });

  it("calls recordFailure with SYNC_ERROR on unexpected error", async () => {
    const upsertBatch = vi.fn();
    const recordFailure = vi.fn();

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    await syncCalendarConnection({
      connectionId: "conn-error",
      provider: "google",
      accessToken: "ya1.aFakeToken",
      contributingCalendarIds: ["primary"],
      userId: "user-1",
      timeMin: FIXED_TIME_MIN,
      timeMax: FIXED_TIME_MAX,
      fetchImpl: mockFetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
        deleteByConnectionIdAndCalendarId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure,
      clock: () => fixedNow,
    });

    expect(upsertBatch).not.toHaveBeenCalled();
    expect(recordFailure).toHaveBeenCalledWith({
      code: "SYNC_ERROR",
      message: "Network failure",
    });
  });
});

describe("RateLimitError", () => {
  it("stores retryAfterMs when provided", () => {
    const error = new RateLimitError(30_000);
    expect(error.retryAfterMs).toBe(30_000);
    expect(error.message).toContain("30000ms");
  });

  it("stores undefined when no retryAfterMs", () => {
    const error = new RateLimitError(undefined);
    expect(error.retryAfterMs).toBeUndefined();
  });
});

describe("ServerError", () => {
  it("stores retryAfterMs when provided", () => {
    const error = new ServerError(60_000);
    expect(error.retryAfterMs).toBe(60_000);
    expect(error.message).toContain("60000ms");
  });

  it("stores undefined when no retryAfterMs", () => {
    const error = new ServerError(undefined);
    expect(error.retryAfterMs).toBeUndefined();
  });
});
