import { describe, expect, it } from "vitest";

import {
  AmbiguousLocalTimeError,
  LocalTimeError,
  NonexistentLocalTimeError,
  isValidTimeZone,
} from "./local-time";

describe("isValidTimeZone", () => {
  it("accepts canonical IANA zones including half-hour offsets", () => {
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Kathmandu")).toBe(true);
    expect(isValidTimeZone("Pacific/Chatham")).toBe(true);
    expect(isValidTimeZone("Australia/Lord_Howe")).toBe(true);
  });

  it("rejects non-IANA strings", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Not a zone")).toBe(false);
  });

  it("returns false for values that Intl cannot resolve", () => {
    const zone = "Definitely/Not/A_Real_Zone";
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe("LocalTimeError hierarchy", () => {
  it("NonexistentLocalTimeError extends LocalTimeError extends Error", () => {
    const local = { year: 2026, month: 3, day: 8, hour: 2, minute: 30 };
    const none = new NonexistentLocalTimeError(local, "America/New_York");
    expect(none).toBeInstanceOf(Error);
    expect(none).toBeInstanceOf(LocalTimeError);
    expect(none).toBeInstanceOf(NonexistentLocalTimeError);
    expect(none.name).toBe("NonexistentLocalTimeError");
    expect(none.local).toEqual(local);
    expect(none.timeZone).toBe("America/New_York");
  });

  it("AmbiguousLocalTimeError extends LocalTimeError extends Error", () => {
    const local = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 };
    const amb = new AmbiguousLocalTimeError(local, "America/New_York");
    expect(amb).toBeInstanceOf(Error);
    expect(amb).toBeInstanceOf(LocalTimeError);
    expect(amb).toBeInstanceOf(AmbiguousLocalTimeError);
    expect(amb.name).toBe("AmbiguousLocalTimeError");
    expect(amb.local).toEqual(local);
    expect(amb.timeZone).toBe("America/New_York");
  });
});