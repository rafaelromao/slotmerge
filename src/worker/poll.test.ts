import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../calendar/repository", () => ({
  listActiveConnections: vi.fn(),
}));

vi.mock("./sync", () => ({
  enqueueSyncCalendarConnectionJob: vi.fn(),
}));

import { listActiveConnections } from "../calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "./sync";
import { handlePollCalendarConnectionsJob } from "./poll";

const FIXED_NOW = new Date("2026-07-12T12:00:00Z").getTime();

describe("handlePollCalendarConnectionsJob", () => {
  const mockConnections = [
    {
      record: {
        id: "conn-1",
        userId: "user-1",
        provider: "google" as const,
        status: "connected" as const,
        contributingCalendarIds: ["primary"],
      },
    },
    {
      record: {
        id: "conn-2",
        userId: "user-2",
        provider: "microsoft" as const,
        status: "connected" as const,
        contributingCalendarIds: ["user@domain.com"],
      },
    },
  ];

  beforeEach(() => {
    vi.mocked(listActiveConnections).mockResolvedValue(
      mockConnections as never,
    );
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues sync jobs with jitter for each active connection", async () => {
    const maxJitter = 5 * 60 * 1000;
    const expectedDelay = Math.floor(maxJitter * 0.5);
    const expectedRunAt = new Date(FIXED_NOW + expectedDelay).getTime();

    const randomValues = [0.5, 0.5];
    let randomIndex = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      return randomValues[randomIndex++] ?? 0.5;
    });

    await handlePollCalendarConnectionsJob();

    expect(vi.mocked(enqueueSyncCalendarConnectionJob)).toHaveBeenCalledTimes(
      2,
    );

    const call1 = vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[0] as [
      string,
      string,
      Date,
    ];
    const call2 = vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[1] as [
      string,
      string,
      Date,
    ];

    expect(call1[0]).toBe("conn-1");
    expect(call2[0]).toBe("conn-2");
    expect(call1[2].getTime()).toBe(expectedRunAt);
    expect(call2[2].getTime()).toBe(expectedRunAt);
  });

  it("runAt is within 0-5 minute jitter range", async () => {
    vi.mocked(listActiveConnections).mockResolvedValue([
      mockConnections[0],
    ] as never);

    vi.spyOn(Math, "random").mockReturnValue(0.5);

    await handlePollCalendarConnectionsJob();

    expect(vi.mocked(enqueueSyncCalendarConnectionJob)).toHaveBeenCalledTimes(
      1,
    );

    const call = vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[0] as [
      string,
      string,
      Date,
    ];
    const maxJitter = 5 * 60 * 1000;
    const expectedDelay = Math.floor(maxJitter * 0.5);

    expect(call[2].getTime()).toBe(FIXED_NOW + expectedDelay);
    expect(call[2].getTime()).toBeGreaterThanOrEqual(FIXED_NOW);
    expect(call[2].getTime()).toBeLessThanOrEqual(FIXED_NOW + maxJitter);
  });
});
