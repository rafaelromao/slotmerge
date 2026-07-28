import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  AmbiguousLocalTimeError,
  getLocalDateParts,
  getLocalDayHour,
  isValidTimeZone,
  localDateTimeToUtc,
  localDayNumber,
  NonexistentLocalTimeError,
  startOfWeekInTimezone,
  type LocalDateTime,
} from "./local-time";

describe("isValidTimeZone", () => {
  it("accepts canonical IANA zones", () => {
    expect(() => isValidTimeZone("America/New_York")).not.toThrow();
    expect(() => isValidTimeZone("Asia/Katmandu")).not.toThrow();
    expect(() => isValidTimeZone("UTC")).not.toThrow();
    expect(() => isValidTimeZone("Pacific/Chatham")).not.toThrow();
    expect(() => isValidTimeZone("Australia/Eucla")).not.toThrow();
    expect(() => isValidTimeZone("Pacific/Auckland")).not.toThrow();
    expect(() => isValidTimeZone("Europe/London")).not.toThrow();
  });

  it("throws RangeError for an empty string", () => {
    expect(() => isValidTimeZone("")).toThrow(RangeError);
  });

  it("throws RangeError for a casing variant", () => {
    expect(() => isValidTimeZone("america/new_york")).toThrow(RangeError);
  });

  it("throws RangeError for an abbreviation", () => {
    expect(() => isValidTimeZone("EST")).toThrow(RangeError);
  });

  it("throws RangeError for garbage input", () => {
    expect(() => isValidTimeZone("Foo/Bar")).toThrow(RangeError);
    expect(() => isValidTimeZone("not-a-zone")).toThrow(RangeError);
  });

  it("does not silently fall back to UTC on invalid zones", () => {
    try {
      isValidTimeZone("Garbage/Zone");
      throw new Error("expected throw");
    } catch (caught) {
      expect(caught).toBeInstanceOf(RangeError);
    }
  });
});

describe("getLocalDateParts", () => {
  it("returns the local civil date in the named zone", () => {
    const parts = getLocalDateParts(
      new Date("2026-03-08T05:00:00Z"),
      "America/New_York",
    );
    expect(parts).toEqual({ year: 2026, month: 3, day: 8 });
  });

  it("uses one-based months", () => {
    const parts = getLocalDateParts(new Date("2026-01-15T12:00:00Z"), "UTC");
    expect(parts.month).toBe(1);
  });

  it("handles half-hour zones", () => {
    const parts = getLocalDateParts(
      new Date("2026-07-15T18:15:00Z"),
      "Asia/Katmandu",
    );
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(7);
    expect(parts.day).toBe(16);
  });

  it("handles zones crossing the date line", () => {
    const parts = getLocalDateParts(
      new Date("2026-07-15T10:00:00Z"),
      "Pacific/Auckland",
    );
    expect(parts.day).toBe(15);
    expect(parts.month).toBe(7);
  });

  it("throws RangeError for invalid timezone", () => {
    expect(() =>
      getLocalDateParts(new Date("2026-07-15T12:00:00Z"), "Foo/Bar"),
    ).toThrow(RangeError);
  });
});

describe("localDayNumber", () => {
  it("returns the epoch day count for a local civil date", () => {
    const day = localDayNumber(new Date("2026-07-15T12:00:00Z"), "UTC");
    const expected = Date.UTC(2026, 6, 15) / 86400000;
    expect(day).toBe(expected);
  });

  it("uses the local zone not the host", () => {
    const day = localDayNumber(
      new Date("2026-07-15T03:00:00Z"),
      "America/New_York",
    );
    const expected = Date.UTC(2026, 6, 14) / 86400000;
    expect(day).toBe(expected);
  });

  it("computes the day delta between two instants", () => {
    const start = localDayNumber(new Date("2026-07-13T00:00:00Z"), "UTC");
    const end = localDayNumber(new Date("2026-07-20T00:00:00Z"), "UTC");
    expect(end - start).toBe(7);
  });
});

describe("addCivilDays", () => {
  it("adds whole civil days in UTC", () => {
    const start = new Date("2026-07-13T00:00:00Z");
    const result = addCivilDays(start, 5, "UTC");
    expect(result.toISOString()).toBe("2026-07-18T00:00:00.000Z");
  });

  it("crosses a date line correctly", () => {
    const start = new Date("2026-07-15T00:00:00Z");
    const result = addCivilDays(start, 7, "UTC");
    expect(result.toISOString()).toBe("2026-07-22T00:00:00.000Z");
  });

  it("works in non-UTC zones (America/New_York summer)", () => {
    const start = new Date("2026-07-13T04:00:00Z");
    const result = addCivilDays(start, 1, "America/New_York");
    expect(result.toISOString()).toBe("2026-07-14T04:00:00.000Z");
  });
});

describe("localDateTimeToUtc", () => {
  it("converts unambiguous local time in UTC", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 13,
      hour: 12,
      minute: 0,
    };
    const result = localDateTimeToUtc(local, "UTC");
    expect(result.toISOString()).toBe("2026-07-13T12:00:00.000Z");
  });

  it("converts unambiguous local time in America/New_York (EDT, UTC-04:00)", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 13,
      hour: 9,
      minute: 0,
    };
    const result = localDateTimeToUtc(local, "America/New_York");
    expect(result.toISOString()).toBe("2026-07-13T13:00:00.000Z");
  });

  it("converts unambiguous local time in America/New_York (EST, UTC-05:00)", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 1,
      day: 15,
      hour: 9,
      minute: 0,
    };
    const result = localDateTimeToUtc(local, "America/New_York");
    expect(result.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("converts unambiguous local time in Asia/Katmandu (+05:45)", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 15,
      hour: 12,
      minute: 0,
    };
    const result = localDateTimeToUtc(local, "Asia/Katmandu");
    expect(result.toISOString()).toBe("2026-07-15T06:15:00.000Z");
  });

  it("converts unambiguous local time in Pacific/Chatham (+12:45)", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 15,
      hour: 12,
      minute: 0,
    };
    const result = localDateTimeToUtc(local, "Pacific/Chatham");
    expect(result.toISOString()).toBe("2026-07-14T23:15:00.000Z");
  });

  it("round-trips back to the same local fields", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 3,
      day: 7,
      hour: 23,
      minute: 30,
      second: 45,
    };
    const utc = localDateTimeToUtc(local, "America/New_York");
    const parts = getLocalDateParts(utc, "America/New_York");
    expect(parts).toEqual({ year: 2026, month: 3, day: 7 });
  });

  it("accepts seconds omitted and treats them as 0", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 13,
      hour: 12,
      minute: 30,
    };
    const utc = localDateTimeToUtc(local, "UTC");
    expect(utc.toISOString()).toBe("2026-07-13T12:30:00.000Z");
  });

  it("throws RangeError for invalid timezone", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 13,
      hour: 12,
      minute: 0,
    };
    expect(() => localDateTimeToUtc(local, "Foo/Bar")).toThrow(RangeError);
  });

  it("throws RangeError for out-of-range civil fields", () => {
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 13, day: 1, hour: 0, minute: 0 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 2, day: 30, hour: 0, minute: 0 },
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
        { year: 2026, month: 1, day: 1, hour: 12, minute: 60 },
        "UTC",
      ),
    ).toThrow(RangeError);
    expect(() =>
      localDateTimeToUtc(
        { year: 2026, month: 1, day: 1, hour: 12, minute: 0, second: 60 },
        "UTC",
      ),
    ).toThrow(RangeError);
  });

  it("uses the Intl round-trip resolver, not host-local constructors", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 7,
      day: 13,
      hour: 9,
      minute: 0,
    };
    const utc = localDateTimeToUtc(local, "Asia/Katmandu");
    expect(utc.toISOString()).toBe("2026-07-13T03:15:00.000Z");
  });
});

describe("NonexistentLocalTimeError (spring-forward)", () => {
  it("throws for America/New_York 2026-03-08 02:30 (DST forward)", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 3,
      day: 8,
      hour: 2,
      minute: 30,
    };
    expect(() => localDateTimeToUtc(local, "America/New_York")).toThrow(
      NonexistentLocalTimeError,
    );
  });

  it("throws for Europe/London 2026-03-29 01:30", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 3,
      day: 29,
      hour: 1,
      minute: 30,
    };
    expect(() => localDateTimeToUtc(local, "Europe/London")).toThrow(
      NonexistentLocalTimeError,
    );
  });

  it("NonexistentLocalTimeError carries the bracket instants", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 3,
      day: 8,
      hour: 2,
      minute: 30,
    };
    try {
      localDateTimeToUtc(local, "America/New_York");
      throw new Error("expected throw");
    } catch (caught) {
      expect(caught).toBeInstanceOf(NonexistentLocalTimeError);
      const err = caught as NonexistentLocalTimeError;
      expect(err.name).toBe("NonexistentLocalTimeError");
      expect(err.local).toEqual(local);
      expect(err.timezone).toBe("America/New_York");
      expect(err.utcBefore).toBeInstanceOf(Date);
      expect(err.utcAfter).toBeInstanceOf(Date);
    }
  });
});

describe("AmbiguousLocalTimeError (fall-back)", () => {
  it("throws for America/New_York 2026-11-01 01:30 (DST back)", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 11,
      day: 1,
      hour: 1,
      minute: 30,
    };
    expect(() => localDateTimeToUtc(local, "America/New_York")).toThrow(
      AmbiguousLocalTimeError,
    );
  });

  it("throws for Europe/London 2026-10-25 01:30", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 10,
      day: 25,
      hour: 1,
      minute: 30,
    };
    expect(() => localDateTimeToUtc(local, "Europe/London")).toThrow(
      AmbiguousLocalTimeError,
    );
  });

  it("AmbiguousLocalTimeError carries both candidate instants", () => {
    const local: LocalDateTime = {
      year: 2026,
      month: 11,
      day: 1,
      hour: 1,
      minute: 30,
    };
    try {
      localDateTimeToUtc(local, "America/New_York");
      throw new Error("expected throw");
    } catch (caught) {
      expect(caught).toBeInstanceOf(AmbiguousLocalTimeError);
      const err = caught as AmbiguousLocalTimeError;
      expect(err.name).toBe("AmbiguousLocalTimeError");
      expect(err.local).toEqual(local);
      expect(err.timezone).toBe("America/New_York");
      expect(err.utcEarlier).toBeInstanceOf(Date);
      expect(err.utcLater).toBeInstanceOf(Date);
      expect(err.utcEarlier.getTime()).toBeLessThan(err.utcLater.getTime());
      expect(err.utcLater.getTime() - err.utcEarlier.getTime()).toBe(
        60 * 60 * 1000,
      );
    }
  });
});

describe("startOfWeekInTimezone", () => {
  it("returns preceding Monday for Wednesday in UTC", () => {
    const date = new Date("2026-07-15T12:00:00Z");
    const result = startOfWeekInTimezone(date, "UTC");
    expect(result.toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });

  it("keeps Monday as Monday in UTC", () => {
    const date = new Date("2026-07-13T00:00:00Z");
    const result = startOfWeekInTimezone(date, "UTC");
    expect(result.toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });

  it("returns preceding Monday for Sunday late evening in America/New_York", () => {
    const date = new Date("2026-07-19T23:59:59Z");
    const result = startOfWeekInTimezone(date, "America/New_York");
    expect(result.toISOString()).toBe("2026-07-13T04:00:00.000Z");
  });

  it("returns Monday 00:00 local across the fall DST boundary", () => {
    const date = new Date("2026-11-01T18:00:00Z");
    const result = startOfWeekInTimezone(date, "America/New_York");
    expect(result.toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });

  it("the returned instant round-trips back to a Monday in getLocalDateParts", () => {
    const date = new Date("2026-07-15T12:00:00Z");
    const result = startOfWeekInTimezone(date, "America/New_York");
    const parts = getLocalDateParts(result, "America/New_York");
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(7);
    expect(parts.day).toBe(13);
  });

  it("throws RangeError for invalid timezone", () => {
    expect(() =>
      startOfWeekInTimezone(new Date("2026-07-15T12:00:00Z"), "Foo/Bar"),
    ).toThrow(RangeError);
  });
});

describe("getLocalDayHour", () => {
  it("returns Sunday noon for Sunday noon UTC", () => {
    const result = getLocalDayHour(new Date("2026-07-12T12:00:00Z"), "UTC");
    expect(result).toEqual({ dayOfWeek: 0, hour: 12 });
  });

  it("returns the local day-of-week not the host day", () => {
    const result = getLocalDayHour(
      new Date("2026-07-15T18:00:00Z"),
      "Asia/Katmandu",
    );
    expect(result.dayOfWeek).toBeGreaterThanOrEqual(0);
    expect(result.dayOfWeek).toBeLessThanOrEqual(6);
  });

  it("rolls Saturday late-evening UTC into Sunday in Asia/Katmandu", () => {
    const result = getLocalDayHour(
      new Date("2026-07-18T20:00:00Z"),
      "Asia/Katmandu",
    );
    expect(result.dayOfWeek).toBe(0);
    expect(result.hour).toBe(1);
  });

  it("throws RangeError for invalid timezone", () => {
    expect(() =>
      getLocalDayHour(new Date("2026-07-15T12:00:00Z"), "Foo/Bar"),
    ).toThrow(RangeError);
  });
});

describe("module purity", () => {
  it("does not consult process.env.TZ", () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      const local: LocalDateTime = {
        year: 2026,
        month: 7,
        day: 15,
        hour: 12,
        minute: 0,
      };
      const utc = localDateTimeToUtc(local, "UTC");
      expect(utc.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});
