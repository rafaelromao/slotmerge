import { describe, expect, it } from "vitest";

import { decryptCalendarToken, encryptCalendarToken } from "../src/calendar/token-encryption";

describe("calendar token encryption", () => {
  it("round-trips tokens without exposing plaintext", () => {
    const encrypted = encryptCalendarToken({
      plaintext: "refresh-token-123",
      key: "0123456789abcdef0123456789abcdef",
    });

    expect(encrypted).not.toContain("refresh-token-123");
    expect(
      decryptCalendarToken({
        ciphertext: encrypted,
        key: "0123456789abcdef0123456789abcdef",
      }),
    ).toBe("refresh-token-123");
  });
});
