import { describe, expect, it } from "vitest";

import {
  AmbiguousLocalTimeError,
  LocalTimeError,
  NonexistentLocalTimeError,
  isValidTimeZone,
  localDateTimeToUtc,
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

describe("localDateTimeToUtc", () => {
  it("returns the matching UTC instant for UTC zone", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 30 },
      "UTC",
    );
    expect(utc.toISOString()).toBe("2026-07-06T09:30:00.000Z");
  });

  it("applies the zone offset for America/New_York in summer (EDT)", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 0 },
      "America/New_York",
    );
    expect(utc.toISOString()).toBe("2026-07-06T13:00:00.000Z");
  });

  it("applies the zone offset for America/New_York in winter (EST)", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 1, day: 6, hour: 9, minute: 0 },
      "America/New_York",
    );
    expect(utc.toISOString()).toBe("2026-01-06T14:00:00.000Z");
  });

  it("applies the half-hour offset for Asia/Kathmandu", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 0 },
      "Asia/Kathmandu",
    );
    expect(utc.toISOString()).toBe("2026-07-06T03:15:00.000Z");
  });

  it("applies the 30-minute DST offset for Australia/Lord_Howe", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 0 },
      "Australia/Lord_Howe",
    );
    expect(utc.toISOString()).toBe("2026-07-05T22:30:00.000Z");
  });

  it("defaults omitted hour, minute, and second to 0", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6 },
      "UTC",
    );
    expect(utc.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("throws RangeError for an invalid timeZone with no UTC fallback", () => {
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 7, day: 6, hour: 9, minute: 0 },
        "Mars/Olympus",
      ),
    ).toThrow(RangeError);
  });

  it("throws NonexistentLocalTimeError for a spring-forward DST gap", () => {
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
        "America/New_York",
      ),
    ).toThrow(NonexistentLocalTimeError);
  });

  it("throws AmbiguousLocalTimeError for a fall-back DST overlap", () => {
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
        "America/New_York",
      ),
    ).toThrow(AmbiguousLocalTimeError);
  });

  it("throws RangeError for an out-of-range month", () => {
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 13, day: 1, hour: 9, minute: 0 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 0, day: 1, hour: 9, minute: 0 },
        "UTC",
      ),
    ).toThrow(RangeError);
  });

  it("throws RangeError for an out-of-range day, hour, minute, or second", () => {
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 1, day: 0, hour: 9, minute: 0 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 1, day: 32, hour: 9, minute: 0 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 1, day: 1, hour: 24, minute: 0 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 1, day: 1, hour: 9, minute: 60 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 1, day: 1, hour: 9, minute: 0, second: 60 },
        "UTC",
      ),
    ).toThrow(RangeError);
  });

  it("honours a non-zero second component", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 0, second: 45 },
      "UTC",
    );
    expect(utc.toISOString()).toBe("2026-07-06T09:00:45.000Z");
  });

  it("round-trip back through Intl reproduces the local fields in non-DST zones", () => {
    const utc = localDateTimeToUtc(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 0 },
      "Asia/Kathmandu",
    );
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(utc);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    expect(Number(get("year"))).toBe(2026);
    expect(Number(get("month"))).toBe(7);
    expect(Number(get("day"))).toBe(6);
    expect(Number(get("hour"))).toBe(9);
    expect(Number(get("minute"))).toBe(0);
    expect(Number(get("second"))).toBe(0);
  });
});

describe("localDateTimeToUtc host-clock independence", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("produces the same answer with TZ=UTC and TZ=America/Los_Angeles", () => {
    const local = { year: 2026, month: 7, day: 6, hour: 9, minute: 30 };

    process.env.TZ = "UTC";
    const utcAnswer = localDateTimeToUtc(local, "America/New_York").toISOString();

    process.env.TZ = "America/Los_Angeles";
    const laAnswer = localDateTimeToUtc(local, "America/New_York").toISOString();

    expect(laAnswer).toBe(utcAnswer);
  });

  it("produces the same answer for half-hour offsets regardless of host TZ", () => {
    const local = { year: 2026, month: 7, day: 6, hour: 9, minute: 0 };

    process.env.TZ = "UTC";
    const utcAnswer = localDateTimeToUtc(local, "Asia/Kathmandu").toISOString();

    process.env.TZ = "Asia/Tokyo";
    const tokyoAnswer = localDateTimeToUtc(local, "Asia/Kathmandu").toISOString();

    expect(tokyoAnswer).toBe(utcAnswer);
  });
});