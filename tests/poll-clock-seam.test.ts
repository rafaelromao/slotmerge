import { describe, expect, it, vi, beforeEach } from "vitest";

import { buildTestClock } from "./test-clock";

vi.mock("../src/worker/sync", () => ({
  enqueueSyncCalendarConnectionJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/calendar/repository", () => ({
  listActiveConnections: vi.fn().mockResolvedValue([
    {
      id: "conn-poll-1",
      provider: "google" as const,
      status: "connected",
    },
    {
      id: "conn-poll-2",
      provider: "microsoft" as const,
      status: "connected",
    },
  ]),
}));

vi.mock("../src/config/runtime", () => ({
  loadRuntimeConfig: vi.fn().mockReturnValue({
    databaseUrl: "postgres://test",
    appEnv: "test",
  }),
}));

import { enqueueSyncCalendarConnectionJob } from "../src/worker/sync";

describe("clock option in poll worker", () => {
  beforeEach(() => {
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
  });

  it("clock option controls the base time for jitter calculation", async () => {
    const { handlePollCalendarConnectionsJob } = await import(
      "../src/worker/poll"
    );
    const clock = buildTestClock(new Date("2026-01-01T00:00:00.000Z"));

    vi.spyOn(Math, "random").mockReturnValue(0);

    await handlePollCalendarConnectionsJob({ clock: () => clock.now() });

    expect(enqueueSyncCalendarConnectionJob).toHaveBeenCalledTimes(2);

    for (const call of vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls) {
      const [, , runAt] = call as [string, string, Date];
      expect(runAt instanceof Date).toBe(true);
      expect(runAt.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-01-01T00:00:00.000Z").getTime(),
      );
      expect(runAt.getTime()).toBeLessThanOrEqual(
        new Date("2026-01-01T00:05:00.000Z").getTime(),
      );
    }
  });

  it("advanced clock shifts the runAt window forward", async () => {
    const { handlePollCalendarConnectionsJob } = await import(
      "../src/worker/poll"
    );
    const clock = buildTestClock(new Date("2026-01-01T00:00:00.000Z"));

    clock.advance(3600 * 1000);
    vi.spyOn(Math, "random").mockReturnValue(0);

    await handlePollCalendarConnectionsJob({ clock: () => clock.now() });

    for (const call of vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls) {
      const [, , runAt] = call as [string, string, Date];
      expect(runAt instanceof Date).toBe(true);
      expect(runAt.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-01-01T01:00:00.000Z").getTime(),
      );
      expect(runAt.getTime()).toBeLessThanOrEqual(
        new Date("2026-01-01T01:05:00.000Z").getTime(),
      );
    }
  });
});
