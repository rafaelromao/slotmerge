import { describe, expect, it } from "vitest";

import { systemDependencies } from "./index";

describe("systemDependencies", () => {
  it("returns a Clock whose now() is close to wall-clock time", () => {
    const { clock } = systemDependencies();
    const before = new Date();
    const now = clock.now();
    const after = new Date();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(now.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("returns a RandomSource whose next() yields [0, 1)", () => {
    const { randomSource } = systemDependencies();

    for (let i = 0; i < 1000; i++) {
      const value = randomSource.next();
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("returns independent Clock and RandomSource objects", () => {
    const a = systemDependencies();
    const b = systemDependencies();

    expect(a.clock).not.toBe(b.clock);
    expect(a.randomSource).not.toBe(b.randomSource);
  });
});