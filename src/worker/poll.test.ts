import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../calendar/repository", () => ({
  listActiveConnections: vi.fn(),
}));

vi.mock("./sync", () => ({
  enqueueSyncCalendarConnectionJob: vi.fn(),
}));

import { listActiveConnections } from "../calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "./sync";
import { handlePollCalendarConnectionsJob, MAX_JITTER_MS } from "./poll";
import { buildTestClock, type TestClock } from "../../tests/test-clock";
import type { RandomSource } from "../system/random";

const FIXED_NOW = new Date("2026-07-12T12:00:00Z");

const mockConnections = [
  {
    id: "conn-1",
    userId: "user-1",
    provider: "google" as const,
    status: "connected" as const,
    contributingCalendarIds: ["primary"],
    providerAccountKey: null,
    accountIdentifier: null,
    scopes: null,
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  },
  {
    id: "conn-2",
    userId: "user-2",
    provider: "microsoft" as const,
    status: "connected" as const,
    contributingCalendarIds: ["user@domain.com"],
    providerAccountKey: null,
    accountIdentifier: null,
    scopes: null,
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  },
];

function constantRandomSource(value: number): RandomSource {
  return { next: () => value };
}

describe("handlePollCalendarConnectionsJob", () => {
  beforeEach(() => {
    vi.mocked(listActiveConnections).mockResolvedValue(
      mockConnections as never,
    );
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enqueues sync jobs with jitter for each active connection", async () => {
    const clock: TestClock = buildTestClock(FIXED_NOW);
    const randomSource = constantRandomSource(0.5);

    const expectedDelay = Math.floor(MAX_JITTER_MS * 0.5);
    const expectedRunAt = FIXED_NOW.getTime() + expectedDelay;

    await handlePollCalendarConnectionsJob(undefined, { clock, randomSource });

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

    const clock: TestClock = buildTestClock(FIXED_NOW);
    const randomSource = constantRandomSource(0.5);

    await handlePollCalendarConnectionsJob(undefined, { clock, randomSource });

    expect(vi.mocked(enqueueSyncCalendarConnectionJob)).toHaveBeenCalledTimes(
      1,
    );

    const call = vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[0] as [
      string,
      string,
      Date,
    ];
    const expectedDelay = Math.floor(MAX_JITTER_MS * 0.5);

    expect(call[2].getTime()).toBe(FIXED_NOW.getTime() + expectedDelay);
    expect(call[2].getTime()).toBeGreaterThanOrEqual(FIXED_NOW.getTime());
    expect(call[2].getTime()).toBeLessThanOrEqual(
      FIXED_NOW.getTime() + MAX_JITTER_MS,
    );
  });

  it("runAt tracks the injected clock when time is advanced", async () => {
    const clock: TestClock = buildTestClock(FIXED_NOW);
    const randomSource = constantRandomSource(0);

    const advanced = new Date("2027-01-01T00:00:00Z");
    clock.advance(advanced.getTime() - FIXED_NOW.getTime());

    await handlePollCalendarConnectionsJob(undefined, { clock, randomSource });

    const call = vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[0] as [
      string,
      string,
      Date,
    ];
    expect(call[2].getTime()).toBe(advanced.getTime());
  });

  it("jitter uses injected randomSource rather than Math.random", async () => {
    const spy = vi.spyOn(Math, "random");
    const clock: TestClock = buildTestClock(FIXED_NOW);

    const values = [0.1, 0.9];
    let index = 0;
    const randomSource: RandomSource = {
      next: () => values[index++] ?? 0.5,
    };

    await handlePollCalendarConnectionsJob(undefined, { clock, randomSource });

    expect(spy).not.toHaveBeenCalled();

    const delays = vi
      .mocked(enqueueSyncCalendarConnectionJob)
      .mock.calls.map(
        (call) => (call[2] as Date).getTime() - FIXED_NOW.getTime(),
      );
    expect(delays[0]).toBe(Math.floor(MAX_JITTER_MS * 0.1));
    expect(delays[1]).toBe(Math.floor(MAX_JITTER_MS * 0.9));
  });
});
