import { describe, expect, it } from "vitest";

import { calculateCalendarSyncRetryDelay } from "./sync-policy";

describe("calculateCalendarSyncRetryDelay", () => {
  it("honors Retry-After before falling back to backoff", () => {
    const delay = calculateCalendarSyncRetryDelay({
      attempt: 3,
      now: new Date("2026-07-12T12:00:00.000Z"),
      random: () => 0,
      retryAfter: "120",
    });

    expect(delay).toBe(120_000);
  });

  it("falls back to exponential backoff when Retry-After is missing", () => {
    const delay = calculateCalendarSyncRetryDelay({
      attempt: 4,
      now: new Date("2026-07-12T12:00:00.000Z"),
      random: () => 0,
    });

    expect(delay).toBe(480_000);
  });
});
