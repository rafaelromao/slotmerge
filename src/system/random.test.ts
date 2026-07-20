import { describe, expect, it } from "vitest";

import { systemRandomSource } from "./random";

describe("systemRandomSource", () => {
  it("next returns a number in [0, 1) on every call", () => {
    const source = systemRandomSource();

    for (let i = 0; i < 1000; i++) {
      const value = source.next();
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("two systemRandomSource instances are independent objects", () => {
    const sourceA = systemRandomSource();
    const sourceB = systemRandomSource();

    expect(sourceA).not.toBe(sourceB);
    expect(typeof sourceA.next).toBe("function");
    expect(typeof sourceB.next).toBe("function");
  });
});
