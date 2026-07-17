import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

vi.mock("../src/calendar/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/calendar/sync")>();
  return {
    ...actual,
    syncCalendarConnection: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("graphile-worker", () => ({
  quickAddJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/calendar/token-encryption", () => ({
  decryptCalendarToken: vi.fn().mockReturnValue("decrypted-token"),
}));

vi.mock("../src/calendar/repository", () => ({
  getGoogleCalendarConnectionRepository: vi.fn(() => ({
    findById: vi.fn().mockResolvedValue({
      id: "conn-test",
      userId: "user-1",
      status: "connected",
      provider: "google",
      accessTokenEncrypted: "encrypted",
      contributingCalendarIds: ["primary"],
    }),
    updateById: vi.fn().mockResolvedValue(undefined),
  })),
  getMicrosoftCalendarConnectionRepository: vi.fn(() => ({
    findById: vi.fn().mockResolvedValue(null),
    updateById: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../src/calendar/imported-busy-intervals.repository", () => ({
  createPostgresImportedBusyIntervalRepository: vi.fn(() => ({
    upsertBatch: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../src/calendar/sync-failure-recorder", () => ({
  recordCalendarConnectionSyncFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/db/client", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([
                { email: "user@example.com", displayName: "Test User" },
              ]),
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("../src/config/runtime", () => ({
  loadRuntimeConfig: vi.fn().mockReturnValue({
    calendarTokenEncryptionKey: "test-key-32-bytes-long!!!",
    databaseUrl: "postgres://test",
    appEnv: "test",
  }),
}));

import { handleSyncCalendarConnectionJob } from "../src/worker/sync";
import { buildTestClock, type TestClock } from "./test-clock";
import { syncCalendarConnection } from "../src/calendar/sync";
import type { RandomSource } from "../src/system/random";
import { RateLimitError } from "../src/calendar/sync";

function constantRandomSource(value: number): RandomSource {
  return { next: () => value };
}

describe("handleSyncCalendarConnectionJob boundary deps seam", () => {
  let clock: TestClock;

  beforeEach(() => {
    clock = buildTestClock(new Date("2026-01-01T00:00:00.000Z"));
    vi.mocked(syncCalendarConnection).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("injected clock flows into syncCalendarConnection", async () => {
    const randomSource = constantRandomSource(0);

    await handleSyncCalendarConnectionJob(
      { connectionId: "conn-test" },
      { clock, randomSource },
    );

    expect(syncCalendarConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        clock: expect.any(Function),
      }),
    );

    const call = vi.mocked(syncCalendarConnection).mock.calls[0][0] as {
      clock: () => Date;
    };
    const capturedClockTime = call.clock();
    expect(capturedClockTime).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("advanced clock is reflected in syncCalendarConnection call", async () => {
    const randomSource = constantRandomSource(0);
    clock.advance(3600 * 1000);

    await handleSyncCalendarConnectionJob(
      { connectionId: "conn-test" },
      { clock, randomSource },
    );

    const call = vi.mocked(syncCalendarConnection).mock.calls[0][0] as {
      clock: () => Date;
    };
    const capturedClockTime = call.clock();
    expect(capturedClockTime).toEqual(new Date("2026-01-01T01:00:00.000Z"));
  });

  it("retry uses injected randomSource for jitter rather than Math.random", async () => {
    vi.mocked(syncCalendarConnection).mockRejectedValue(
      new RateLimitError(1000),
    );

    const randomValues = [0.5, 0.9];
    let index = 0;
    const randomSource: RandomSource = {
      next: () => randomValues[index++] ?? 0,
    };
    const spy = vi.spyOn(Math, "random");
    const { quickAddJob } = await import("graphile-worker");

    await handleSyncCalendarConnectionJob(
      { connectionId: "conn-test" },
      { clock, randomSource },
    );

    expect(spy).not.toHaveBeenCalled();
    expect(quickAddJob).toHaveBeenCalledTimes(1);
    const call = vi.mocked(quickAddJob).mock.calls[0] as unknown as [
      unknown,
      string,
      unknown,
      { runAt?: Date },
    ];
    const baseDelay = 1000;
    const expectedJitter = Math.floor(baseDelay * 0.5);
    expect(call[3].runAt?.getTime()).toBe(
      clock.now().getTime() + baseDelay + expectedJitter,
    );
  });
});
