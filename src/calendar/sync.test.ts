import { describe, expect, it, vi } from "vitest";

import { syncCalendarConnection } from "./sync";
import type { ImportedBusyIntervalRecord } from "./imported-busy-intervals";

const fixedNow = new Date("2026-07-12T12:00:00.000Z");

describe("syncCalendarConnection", () => {
  it("early-returns (no-op) when contributingCalendarIds is empty", async () => {
    const upsertBatch = vi.fn();

    await syncCalendarConnection({
      connectionId: "conn-1",
      provider: "google",
      accessToken: "fake-token",
      contributingCalendarIds: [],
      userId: "user-1",
      fetchImpl: fetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure: vi.fn(),
      clock: () => fixedNow,
    });

    expect(upsertBatch).not.toHaveBeenCalled();
  });

  it("calls upsertBatch with mock busy intervals in mock provider mode", async () => {
    const upsertBatch = vi.fn();

    await syncCalendarConnection({
      connectionId: "conn-seeded-test",
      provider: "google",
      accessToken: "fake-token",
      contributingCalendarIds: ["primary"],
      userId: "user-1",
      fetchImpl: fetch,
      busyIntervalRepository: {
        upsertBatch,
        deleteByConnectionId: vi.fn(),
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
    expect(intervals.length).toBeGreaterThan(0);
    expect(intervals[0]?.connectionId).toBe("conn-seeded-test");
    expect(intervals[0]?.userId).toBe("user-1");
    expect(intervals[0]?.providerCalendarId).toBe("primary");
    expect(["busy", "out-of-office", "tentative"]).toContain(
      intervals[0]?.status,
    );
    expect(intervals[0]?.importedAt).toEqual(fixedNow);
  });

  it("produces deterministic mock intervals for the same connectionId", async () => {
    const upsertBatch1 = vi.fn();
    const upsertBatch2 = vi.fn();

    await syncCalendarConnection({
      connectionId: "conn-deterministic",
      provider: "google",
      accessToken: "fake-token",
      contributingCalendarIds: ["primary"],
      userId: "user-1",
      fetchImpl: fetch,
      busyIntervalRepository: {
        upsertBatch: upsertBatch1,
        deleteByConnectionId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure: vi.fn(),
      clock: () => fixedNow,
    });

    await syncCalendarConnection({
      connectionId: "conn-deterministic",
      provider: "google",
      accessToken: "fake-token",
      contributingCalendarIds: ["primary"],
      userId: "user-1",
      fetchImpl: fetch,
      busyIntervalRepository: {
        upsertBatch: upsertBatch2,
        deleteByConnectionId: vi.fn(),
        findByUserIdAndDateRange: vi.fn(),
        deleteExpiredBefore: vi.fn(),
      },
      recordFailure: vi.fn(),
      clock: () => fixedNow,
    });

    const intervals1 = upsertBatch1.mock
      .calls[0][0] as ImportedBusyIntervalRecord[];
    const intervals2 = upsertBatch2.mock
      .calls[0][0] as ImportedBusyIntervalRecord[];
    expect(intervals1[0]?.startAt.getTime()).toBe(
      intervals2[0]?.startAt.getTime(),
    );
    expect(intervals1[0]?.endAt.getTime()).toBe(intervals2[0]?.endAt.getTime());
  });
});
