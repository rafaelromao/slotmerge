import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

vi.mock("../src/calendar/sync", () => {
  const mockFn = vi.fn().mockResolvedValue(undefined);
  return { syncCalendarConnection: mockFn };
});

vi.mock("../src/calendar/token-encryption", () => ({
  decryptCalendarToken: vi.fn().mockReturnValue("decrypted-token"),
}));

vi.mock("../src/calendar/repository", () => ({
  findCalendarConnectionById: vi.fn().mockResolvedValue({
    id: "conn-test",
    userId: "user-1",
    status: "connected",
    provider: "google",
    accessTokenEncrypted: "encrypted",
    contributingCalendarIds: ["primary"],
  }),
  getCalendarConnectionRepository: vi.fn(() => ({
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
            limit: vi.fn().mockResolvedValue([
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

import { setClockForTests, handleSyncCalendarConnectionJob } from "../src/worker/sync";
import { buildTestClock } from "./test-clock";
import { syncCalendarConnection } from "../src/calendar/sync";

describe("setClockForTests seam in sync worker", () => {
  let clock: ReturnType<typeof buildTestClock>;

  beforeEach(() => {
    clock = buildTestClock(new Date("2026-01-01T00:00:00.000Z"));
    setClockForTests(() => clock.now());
    vi.mocked(syncCalendarConnection).mockClear();
  });

  afterEach(() => {
    setClockForTests(null);
    vi.restoreAllMocks();
  });

  it("clock from setClockForTests flows into syncCalendarConnection", async () => {
    await handleSyncCalendarConnectionJob({ connectionId: "conn-test" });

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
    clock.advance(3600 * 1000);

    await handleSyncCalendarConnectionJob({ connectionId: "conn-test" });

    const call = vi.mocked(syncCalendarConnection).mock.calls[0][0] as {
      clock: () => Date;
    };
    const capturedClockTime = call.clock();
    expect(capturedClockTime).toEqual(new Date("2026-01-01T01:00:00.000Z"));
  });
});
