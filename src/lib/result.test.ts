import { describe, expect, it } from "vitest";

import { err, isErr, isOk, ok, type Result } from "./result";

describe("Result<T, E>", () => {
  it("ok(value) constructs a result whose ok discriminant is true", () => {
    const result = ok({ count: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ count: 1 });
    }
  });

  it("err(code) constructs a result whose ok discriminant is false", () => {
    const result: Result<number, { code: "not_found" }> = err({
      code: "not_found",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("isOk narrows the result to the ok variant", () => {
    const result = ok("hello");

    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);

    if (isOk(result)) {
      const value: string = result.value;
      expect(value).toBe("hello");
    }
  });

  it("isErr narrows the result to the err variant", () => {
    const result = err({ code: "bad_input" as const });

    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);

    if (isErr(result)) {
      expect(result.error.code).toBe("bad_input");
    }
  });

  it("preserves the exact value identity for object payloads", () => {
    const payload = { discoverable: true };
    const result = ok(payload);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(payload);
    }
  });
});
