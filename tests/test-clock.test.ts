import { describe, expect, it } from "vitest";

import { buildTestClock } from "./test-clock";

describe("buildTestClock", () => {
  it("now returns the initial time when provided", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const clock = buildTestClock(start);

    expect(clock.now()).toEqual(start);
  });

  it("now returns the current wall-clock time when no initial time is provided", () => {
    const before = new Date();
    const clock = buildTestClock();
    const after = new Date();

    const now = clock.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(now.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("advance moves the clock forward by the specified milliseconds", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const clock = buildTestClock(start);

    clock.advance(5000);

    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:05.000Z"));
  });

  it("advance accumulates multiple time advances", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const clock = buildTestClock(start);

    clock.advance(1000);
    clock.advance(2000);

    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:03.000Z"));
  });

  it("reset returns the clock to a specified date", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const clock = buildTestClock(start);

    clock.advance(10000);
    clock.reset(new Date("2026-06-01T12:30:00.000Z"));

    expect(clock.now()).toEqual(new Date("2026-06-01T12:30:00.000Z"));
  });

  it("reset without argument returns the clock to wall-clock time", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const clock = buildTestClock(start);

    clock.advance(10000);
    clock.reset();

    const now = clock.now();
    const before = new Date();
    expect(now.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(now.getTime()).toBeLessThanOrEqual(before.getTime() + 1000);
  });

  it("two clock instances are isolated — advance on one does not affect the other", () => {
    const startA = new Date("2026-01-01T00:00:00.000Z");
    const startB = new Date("2026-06-01T00:00:00.000Z");
    const clockA = buildTestClock(startA);
    const clockB = buildTestClock(startB);

    clockA.advance(5000);

    expect(clockA.now()).toEqual(new Date("2026-01-01T00:00:05.000Z"));
    expect(clockB.now()).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });
});
