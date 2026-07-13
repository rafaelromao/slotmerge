import { describe, expect, it } from "vitest";

import {
  expandOverrideToUtcRange,
  type AvailabilityOverrideDescriptor,
} from "./availability-overrides";

describe("expandOverrideToUtcRange", () => {
  it("converts local time to UTC correctly", () => {
    const override: AvailabilityOverrideDescriptor = {
      date: "2026-07-20",
      startTime: "09:00",
      endTime: "10:00",
      type: "add",
    };

    const result = expandOverrideToUtcRange(override, "America/New_York");

    expect(result.startUtc).toBeInstanceOf(Date);
    expect(result.endUtc).toBeInstanceOf(Date);
    expect(result.endUtc.getTime()).toBeGreaterThan(result.startUtc.getTime());
  });

  it("handles different timezones", () => {
    const override: AvailabilityOverrideDescriptor = {
      date: "2026-07-20",
      startTime: "09:00",
      endTime: "10:00",
      type: "add",
    };

    const newYorkResult = expandOverrideToUtcRange(override, "America/New_York");
    const londonResult = expandOverrideToUtcRange(override, "Europe/London");

    expect(newYorkResult.startUtc).not.toEqual(londonResult.startUtc);
  });

  it("end time is after start time in UTC", () => {
    const override: AvailabilityOverrideDescriptor = {
      date: "2026-07-20",
      startTime: "09:00",
      endTime: "17:00",
      type: "add",
    };

    const result = expandOverrideToUtcRange(override, "America/New_York");

    const durationMs = result.endUtc.getTime() - result.startUtc.getTime();
    expect(durationMs).toBe(8 * 60 * 60 * 1000);
  });
});

describe("expandOverrideToUtcRange DST", () => {
  it("handles spring forward DST transition", () => {
    const override: AvailabilityOverrideDescriptor = {
      date: "2026-03-08",
      startTime: "09:00",
      endTime: "10:00",
      type: "add",
    };

    const result = expandOverrideToUtcRange(override, "America/New_York");

    expect(result.startUtc).toBeInstanceOf(Date);
    expect(result.endUtc).toBeInstanceOf(Date);
    expect(result.endUtc.getTime()).toBeGreaterThan(result.startUtc.getTime());
  });

  it("handles fall back DST transition", () => {
    const override: AvailabilityOverrideDescriptor = {
      date: "2026-11-07",
      startTime: "09:00",
      endTime: "10:00",
      type: "add",
    };

    const result = expandOverrideToUtcRange(override, "America/New_York");

    expect(result.startUtc).toBeInstanceOf(Date);
    expect(result.endUtc).toBeInstanceOf(Date);
    expect(result.endUtc.getTime()).toBeGreaterThan(result.startUtc.getTime());
  });

  it("handles UTC timezone without DST", () => {
    const override: AvailabilityOverrideDescriptor = {
      date: "2026-07-20",
      startTime: "09:00",
      endTime: "10:00",
      type: "add",
    };

    const result = expandOverrideToUtcRange(override, "UTC");

    expect(result.startUtc).toBeInstanceOf(Date);
    expect(result.endUtc).toBeInstanceOf(Date);
    const durationMs = result.endUtc.getTime() - result.startUtc.getTime();
    expect(durationMs).toBe(60 * 60 * 1000);
  });
});
