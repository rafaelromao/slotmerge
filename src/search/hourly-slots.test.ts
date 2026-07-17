import { describe, expect, it } from "vitest";

import { generateHourlySlots } from "./hourly-slots";

function getLocalHourMinute(
  date: Date,
  timezone: string,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { hour: get("hour"), minute: get("minute") };
}

describe("generateHourlySlots", () => {
  it("returns a single slot when rangeStart and rangeEnd are in the same hour", () => {
    const rangeStart = new Date("2026-07-06T10:15:00.000Z");
    const rangeEnd = new Date("2026-07-06T10:45:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots).toHaveLength(1);
    expect(slots[0].toISOString()).toBe("2026-07-06T10:00:00.000Z");
  });

  it("corrects a misaligned rangeStart to the previous hour boundary", () => {
    const rangeStart = new Date("2026-07-06T10:30:00.000Z");
    const rangeEnd = new Date("2026-07-06T12:00:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots).toHaveLength(2);
    expect(slots[0].toISOString()).toBe("2026-07-06T10:00:00.000Z");
    expect(slots[1].toISOString()).toBe("2026-07-06T11:00:00.000Z");
  });

  it("returns empty array when rangeStart equals rangeEnd", () => {
    const rangeStart = new Date("2026-07-06T10:00:00.000Z");
    const rangeEnd = new Date("2026-07-06T10:00:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots).toHaveLength(0);
  });

  it("returns empty array when rangeStart is after rangeEnd", () => {
    const rangeStart = new Date("2026-07-06T12:00:00.000Z");
    const rangeEnd = new Date("2026-07-06T10:00:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots).toHaveLength(0);
  });

  it("returns correct slots for a range spanning multiple days", () => {
    const rangeStart = new Date("2026-07-06T23:30:00.000Z");
    const rangeEnd = new Date("2026-07-08T01:30:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots[0].toISOString()).toBe("2026-07-06T23:00:00.000Z");
    expect(slots[1].toISOString()).toBe("2026-07-07T00:00:00.000Z");
    const lastSlot = slots[slots.length - 1];
    expect(lastSlot.toISOString()).toBe("2026-07-08T01:00:00.000Z");
    expect(slots.length).toBe(27);
  });

  it("slots are always at XX:00:00.000Z", () => {
    const rangeStart = new Date("2026-07-06T08:00:00.000Z");
    const rangeEnd = new Date("2026-07-06T12:00:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.getUTCMinutes()).toBe(0);
      expect(slot.getUTCSeconds()).toBe(0);
      expect(slot.getUTCMilliseconds()).toBe(0);
    }
  });

  it("rangeEnd is exclusive — last slot ends just before rangeEnd", () => {
    const rangeStart = new Date("2026-07-06T10:00:00.000Z");
    const rangeEnd = new Date("2026-07-06T11:00:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd);

    expect(slots).toHaveLength(1);
    expect(slots[0].toISOString()).toBe("2026-07-06T10:00:00.000Z");
  });

  it("with America/Los_Angeles timezone, slots align to PDT hour boundaries", () => {
    const rangeStart = new Date("2026-07-13T16:00:00.000Z");
    const rangeEnd = new Date("2026-07-13T23:00:00.000Z");

    const slots = generateHourlySlots(
      rangeStart,
      rangeEnd,
      "America/Los_Angeles",
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const { minute } = getLocalHourMinute(slot, "America/Los_Angeles");
      expect(minute).toBe(0);
    }
    expect(slots[0].toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(slots[1].toISOString()).toBe("2026-07-13T17:00:00.000Z");
  });

  it("keeps slots on the local hour across a 30-minute DST transition", () => {
    const timezone = "Australia/Lord_Howe";
    const rangeStart = new Date("2026-10-03T13:00:00.000Z");
    const rangeEnd = new Date("2026-10-03T18:00:00.000Z");

    const slots = generateHourlySlots(rangeStart, rangeEnd, timezone);

    expect(slots.map((slot) => slot.toISOString())).toEqual([
      "2026-10-03T13:30:00.000Z",
      "2026-10-03T14:30:00.000Z",
      "2026-10-03T16:00:00.000Z",
      "2026-10-03T17:00:00.000Z",
    ]);
    for (const slot of slots) {
      expect(getLocalHourMinute(slot, timezone).minute).toBe(0);
    }
  });

  it("with America/Los_Angeles, slots are also on UTC hour boundaries", () => {
    const rangeStart = new Date("2026-07-13T16:00:00.000Z");
    const rangeEnd = new Date("2026-07-13T23:00:00.000Z");

    const slots = generateHourlySlots(
      rangeStart,
      rangeEnd,
      "America/Los_Angeles",
    );

    for (const slot of slots) {
      expect(slot.getUTCMinutes()).toBe(0);
      expect(slot.getUTCSeconds()).toBe(0);
      expect(slot.getUTCMilliseconds()).toBe(0);
    }
  });
});
