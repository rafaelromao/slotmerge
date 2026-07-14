import { describe, expect, it } from "vitest";

import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";
import {
  computeEffectiveAvailability,
  type EffectiveAvailabilityInputs,
} from "./effective-availability";

function makeWindow(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  profileTimezone = "UTC",
): WeeklyAvailabilityWindow {
  return {
    id: `window-${Math.random()}`,
    userId: "user-1",
    dayOfWeek,
    startTime,
    endTime,
    profileTimezone,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeOverride(
  date: string,
  startTime: string,
  endTime: string,
  type: "add" | "block",
  profileTimezone = "UTC",
): AvailabilityOverride {
  return {
    id: `override-${Math.random()}`,
    userId: "user-1",
    date,
    startTime,
    endTime,
    type,
    profileTimezone,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeBusyInterval(
  startAt: Date,
  endAt: Date,
  status: "busy" | "out-of-office" | "tentative" = "busy",
): ImportedBusyIntervalRecord {
  return {
    id: `busy-${Math.random()}`,
    userId: "user-1",
    connectionId: "conn-1",
    providerCalendarId: "primary",
    providerEventReference: null,
    status,
    startAt,
    endAt,
    importedAt: new Date(),
  };
}

describe("computeEffectiveAvailability", () => {
  describe("empty inputs", () => {
    it("returns empty array when user has no windows, no overrides, and no busy intervals", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
        windows: [],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(0);
    });

    it("returns empty array when rangeStart equals rangeEnd", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T12:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T12:00:00.000Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(0);
    });
  });

  describe("weekly windows only", () => {
    it("returns interval for the single matching day", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "10:00")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
      expect(result[0].startUtc.getUTCHours()).toBe(9);
      expect(result[0].endUtc.getUTCHours()).toBe(10);
    });

    it("returns UTC intervals for a matching day", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "10:00")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
      expect(result[0].startUtc).toBeInstanceOf(Date);
      expect(result[0].endUtc).toBeInstanceOf(Date);
      expect(result[0].startUtc < result[0].endUtc).toBe(true);
    });

    it("returns intervals for all matching days in range", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "10:00")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-06T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-20T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(3);
    });

    it("applies profile timezone correctly", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "10:00", "America/New_York")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
      expect(result[0].startUtc.getUTCHours()).toBe(13);
      expect(result[0].endUtc.getUTCHours()).toBe(14);
    });
  });

  describe("add overrides", () => {
    it("add override produces additional available interval", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "10:00")],
        overrides: [makeOverride("2026-07-13", "14:00", "15:00", "add")],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(2);
    });
  });

  describe("block overrides", () => {
    it("block override removes time from weekly window", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "17:00")],
        overrides: [makeOverride("2026-07-13", "12:00", "13:00", "block")],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(2);
    });

    it("block override on a day with no window has no effect", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [],
        overrides: [makeOverride("2026-07-13", "09:00", "10:00", "block")],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(0);
    });
  });

  describe("busy intervals", () => {
    it("busy interval subtracts from effective availability", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "17:00")],
        overrides: [],
        busyIntervals: [
          makeBusyInterval(
            new Date("2026-07-13T10:00:00.000Z"),
            new Date("2026-07-13T11:00:00.000Z"),
            "busy",
          ),
        ],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(2);
    });

    it("out-of-office interval subtracts from effective availability", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "17:00")],
        overrides: [],
        busyIntervals: [
          makeBusyInterval(
            new Date("2026-07-13T10:00:00.000Z"),
            new Date("2026-07-13T11:00:00.000Z"),
            "out-of-office",
          ),
        ],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(2);
    });

    it("tentative interval subtracts from effective availability", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "17:00")],
        overrides: [],
        busyIntervals: [
          makeBusyInterval(
            new Date("2026-07-13T10:00:00.000Z"),
            new Date("2026-07-13T11:00:00.000Z"),
            "tentative",
          ),
        ],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(2);
    });
  });

  describe("buffer", () => {
    it("buffer expands busy interval symmetrically", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 30,
        windows: [makeWindow(1, "09:00", "17:00", "UTC")],
        overrides: [],
        busyIntervals: [
          makeBusyInterval(
            new Date("2026-07-13T10:00:00.000Z"),
            new Date("2026-07-13T11:00:00.000Z"),
            "busy",
          ),
        ],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(2);
    });

    it("buffer on busy interval is clipped to range start", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 30,
        windows: [makeWindow(1, "09:00", "17:00", "UTC")],
        overrides: [],
        busyIntervals: [
          makeBusyInterval(
            new Date("2026-07-13T09:30:00.000Z"),
            new Date("2026-07-13T10:30:00.000Z"),
            "busy",
          ),
        ],
        rangeStart: new Date("2026-07-13T09:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
      expect(result[0].startUtc.getUTCHours()).toBe(11);
      expect(result[0].endUtc.getUTCHours()).toBe(17);
    });
  });

  describe("overrides and busy intervals outside range", () => {
    it("ignores overrides outside the search range", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "10:00")],
        overrides: [makeOverride("2026-07-20", "14:00", "15:00", "add")],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
    });

    it("ignores busy intervals outside the search range", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [makeWindow(1, "09:00", "17:00")],
        overrides: [],
        busyIntervals: [
          makeBusyInterval(
            new Date("2026-07-20T10:00:00.000Z"),
            new Date("2026-07-20T11:00:00.000Z"),
            "busy",
          ),
        ],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
    });
  });

  describe("DST transitions", () => {
    it("weekly window on DST transition day preserves wall-clock duration", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
        windows: [makeWindow(0, "09:00", "17:00", "America/New_York")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-03-08T00:00:00.000Z"),
        rangeEnd: new Date("2026-03-08T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
      const duration =
        result[0].endUtc.getTime() - result[0].startUtc.getTime();
      expect(duration).toBe(8 * 60 * 60 * 1000);
    });

    it("produces different UTC offsets before and after DST transition", () => {
      const winterInputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
        windows: [makeWindow(0, "09:00", "10:00", "America/New_York")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-01-04T00:00:00.000Z"),
        rangeEnd: new Date("2026-01-04T23:59:59.999Z"),
      };

      const summerInputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
        windows: [makeWindow(0, "09:00", "10:00", "America/New_York")],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-06-07T00:00:00.000Z"),
        rangeEnd: new Date("2026-06-07T23:59:59.999Z"),
      };

      const winterResult = computeEffectiveAvailability(winterInputs);
      const summerResult = computeEffectiveAvailability(summerInputs);

      expect(winterResult).toHaveLength(1);
      expect(summerResult).toHaveLength(1);

      const offsetWinter =
        winterResult[0].startUtc.getTime() -
        new Date("2026-01-04T12:00:00.000Z").getTime();
      const offsetSummer =
        summerResult[0].startUtc.getTime() -
        new Date("2026-06-07T12:00:00.000Z").getTime();

      expect(Math.abs(offsetWinter - offsetSummer)).toBeGreaterThan(
        30 * 60 * 1000,
      );
    });
  });

  describe("multiple intervals and merging", () => {
    it("overlapping available intervals are merged", () => {
      const inputs: EffectiveAvailabilityInputs = {
        userId: "user-1",
        profileTimezone: "UTC",
        bufferMinutes: 0,
        windows: [
          makeWindow(1, "09:00", "12:00"),
          makeWindow(1, "11:00", "14:00"),
        ],
        overrides: [],
        busyIntervals: [],
        rangeStart: new Date("2026-07-13T00:00:00.000Z"),
        rangeEnd: new Date("2026-07-13T23:59:59.999Z"),
      };

      const result = computeEffectiveAvailability(inputs);

      expect(result).toHaveLength(1);
      expect(result[0].startUtc.getUTCHours()).toBe(9);
      expect(result[0].endUtc.getUTCHours()).toBe(14);
    });
  });
});
