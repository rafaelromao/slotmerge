import { describe, expect, it } from "vitest";

import { systemClock } from "./clock";

describe("systemClock", () => {
  it("now returns a Date close to wall-clock time", () => {
    const clock = systemClock();
    const before = new Date();

    const now = clock.now();

    const after = new Date();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(now.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("two systemClock instances are independent objects but share the wall-clock source", () => {
    const clockA = systemClock();
    const clockB = systemClock();

    expect(clockA).not.toBe(clockB);
    expect(typeof clockA.now).toBe("function");
    expect(typeof clockB.now).toBe("function");
    expect(clockA.now()).toBeInstanceOf(Date);
    expect(clockB.now()).toBeInstanceOf(Date);
  });
});
