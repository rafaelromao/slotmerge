process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";

import {
  expandWeeklyWindowToUtcRange,
  type WeeklyWindowDescriptor,
} from "../../src/profile/availability-windows";

describe("expandWeeklyWindowToUtcRange", () => {
  it("returns empty array when no days in range match", () => {
    const window: WeeklyWindowDescriptor = {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    };

    const rangeStart = new Date("2026-07-14T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-17T23:59:59.999Z");

    const result = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      rangeStart,
      rangeEnd,
    );

    expect(result).toHaveLength(0);
  });

  it("returns a single interval for a matching day", () => {
    const window: WeeklyWindowDescriptor = {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    };

    const rangeStart = new Date("2026-07-13T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-13T23:59:59.999Z");

    const result = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      rangeStart,
      rangeEnd,
    );

    expect(result).toHaveLength(1);
    expect(result[0].startUtc).toBeInstanceOf(Date);
    expect(result[0].endUtc).toBeInstanceOf(Date);
    expect(result[0].startUtc < result[0].endUtc).toBe(true);
  });

  it("returns intervals for all matching days in range", () => {
    const window: WeeklyWindowDescriptor = {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    };

    const rangeStart = new Date("2026-07-06T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-20T23:59:59.999Z");

    const result = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      rangeStart,
      rangeEnd,
    );

    expect(result).toHaveLength(3);
  });

  it("produces different UTC offsets before and after DST transition", () => {
    const window: WeeklyWindowDescriptor = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
    };

    const jan5 = new Date("2025-01-05T00:00:00.000Z");
    const jun1 = new Date("2025-06-01T00:00:00.000Z");

    const beforeDst = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      jan5,
      jan5,
    );

    const afterDst = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      jun1,
      jun1,
    );

    expect(beforeDst).toHaveLength(1);
    expect(afterDst).toHaveLength(1);

    const durationBefore =
      beforeDst[0].endUtc.getTime() - beforeDst[0].startUtc.getTime();
    const durationAfter =
      afterDst[0].endUtc.getTime() - afterDst[0].startUtc.getTime();

    expect(durationBefore).toBe(60 * 60 * 1000);
    expect(durationAfter).toBe(60 * 60 * 1000);

    const offsetBefore =
      beforeDst[0].startUtc.getTime() -
      new Date("2025-01-05T12:00:00.000Z").getTime();
    const offsetAfter =
      afterDst[0].startUtc.getTime() -
      new Date("2025-06-01T12:00:00.000Z").getTime();

    expect(Math.abs(offsetBefore - offsetAfter)).toBeGreaterThan(
      30 * 60 * 1000,
    );
  });

  it("end time is always after start time regardless of DST", () => {
    const window: WeeklyWindowDescriptor = {
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "10:00",
    };

    const jan4 = new Date("2026-01-04T00:00:00.000Z");
    const jun7 = new Date("2026-06-07T00:00:00.000Z");

    const winterResult = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      jan4,
      jan4,
    );

    const summerResult = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      jun7,
      jun7,
    );

    expect(winterResult[0].startUtc < winterResult[0].endUtc).toBe(true);
    expect(summerResult[0].startUtc < summerResult[0].endUtc).toBe(true);
  });

  it("returns intervals sorted by start time", () => {
    const window: WeeklyWindowDescriptor = {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "10:00",
    };

    const rangeStart = new Date("2026-07-06T00:00:00.000Z");
    const rangeEnd = new Date("2026-07-20T23:59:59.999Z");

    const result = expandWeeklyWindowToUtcRange(
      window,
      "America/New_York",
      rangeStart,
      rangeEnd,
    );

    for (let i = 1; i < result.length; i++) {
      expect(result[i].startUtc > result[i - 1].startUtc).toBe(true);
    }
  });
});
