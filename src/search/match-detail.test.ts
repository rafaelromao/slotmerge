import { describe, expect, it } from "vitest";

import {
  availabilityIndicator,
  deriveCalendarFreshness,
  deriveSearchSnapshotStaleness,
  CALENDAR_STALENESS_THRESHOLD_MS,
} from "./match-detail";

describe("deriveSearchSnapshotStaleness", () => {
  const now = new Date("2026-07-08T15:00:00.000Z");

  it("returns false when generatedAt is within the staleness threshold", () => {
    const generatedAt = new Date("2026-07-08T14:00:00.000Z");
    expect(deriveSearchSnapshotStaleness(generatedAt, now)).toBe(false);
  });

  it("returns true when generatedAt equals the staleness threshold", () => {
    const generatedAt = new Date(
      now.getTime() - CALENDAR_STALENESS_THRESHOLD_MS,
    );
    expect(deriveSearchSnapshotStaleness(generatedAt, now)).toBe(true);
  });

  it("returns true when generatedAt is older than the staleness threshold", () => {
    const generatedAt = new Date("2026-07-07T14:00:00.000Z");
    expect(deriveSearchSnapshotStaleness(generatedAt, now)).toBe(true);
  });

  it("returns false when generatedAt is just before the staleness threshold", () => {
    const generatedAt = new Date(
      now.getTime() - CALENDAR_STALENESS_THRESHOLD_MS + 1000,
    );
    expect(deriveSearchSnapshotStaleness(generatedAt, now)).toBe(false);
  });
});

describe("deriveCalendarFreshness", () => {
  const now = new Date("2026-07-08T15:00:00.000Z");

  it('returns "none" when lastSyncAt is null', () => {
    expect(deriveCalendarFreshness(null, now)).toBe("none");
  });

  it('returns "fresh" when lastSyncAt is within the threshold', () => {
    const lastSyncAt = new Date("2026-07-08T14:00:00.000Z");
    expect(deriveCalendarFreshness(lastSyncAt, now)).toBe("fresh");
  });

  it('returns "stale" when lastSyncAt equals the threshold', () => {
    const lastSyncAt = new Date(
      now.getTime() - CALENDAR_STALENESS_THRESHOLD_MS,
    );
    expect(deriveCalendarFreshness(lastSyncAt, now)).toBe("stale");
  });

  it('returns "stale" when lastSyncAt is older than the threshold', () => {
    const lastSyncAt = new Date("2026-07-07T14:00:00.000Z");
    expect(deriveCalendarFreshness(lastSyncAt, now)).toBe("stale");
  });

  it('returns "fresh" when lastSyncAt is just before the threshold', () => {
    const lastSyncAt = new Date(
      now.getTime() - CALENDAR_STALENESS_THRESHOLD_MS + 1000,
    );
    expect(deriveCalendarFreshness(lastSyncAt, now)).toBe("fresh");
  });
});

describe("availabilityIndicator", () => {
  const durationMinutes = 60;

  it('returns "available" when slot is fully covered by an interval', () => {
    const slotStart = new Date("2026-07-06T10:00:00.000Z");
    const effectiveAvailability: Array<{
      startUtc: Date;
      endUtc: Date;
    }> = [
      {
        startUtc: new Date("2026-07-06T09:00:00.000Z"),
        endUtc: new Date("2026-07-06T11:00:00.000Z"),
      },
    ];

    expect(
      availabilityIndicator(slotStart, effectiveAvailability, durationMinutes),
    ).toBe("available");
  });

  it('returns "available" when slot is at the start of an interval', () => {
    const slotStart = new Date("2026-07-06T10:00:00.000Z");
    const effectiveAvailability: Array<{
      startUtc: Date;
      endUtc: Date;
    }> = [
      {
        startUtc: new Date("2026-07-06T10:00:00.000Z"),
        endUtc: new Date("2026-07-06T11:00:00.000Z"),
      },
    ];

    expect(
      availabilityIndicator(slotStart, effectiveAvailability, durationMinutes),
    ).toBe("available");
  });

  it('returns "partial" when only part of the slot is covered', () => {
    const slotStart = new Date("2026-07-06T10:00:00.000Z");
    const effectiveAvailability: Array<{
      startUtc: Date;
      endUtc: Date;
    }> = [
      {
        startUtc: new Date("2026-07-06T10:00:00.000Z"),
        endUtc: new Date("2026-07-06T10:30:00.000Z"),
      },
    ];

    expect(
      availabilityIndicator(slotStart, effectiveAvailability, durationMinutes),
    ).toBe("partial");
  });

  it('returns "unavailable" when no coverage for the slot', () => {
    const slotStart = new Date("2026-07-06T10:00:00.000Z");
    const effectiveAvailability: Array<{
      startUtc: Date;
      endUtc: Date;
    }> = [
      {
        startUtc: new Date("2026-07-06T08:00:00.000Z"),
        endUtc: new Date("2026-07-06T09:30:00.000Z"),
      },
    ];

    expect(
      availabilityIndicator(slotStart, effectiveAvailability, durationMinutes),
    ).toBe("unavailable");
  });

  it('returns "unavailable" when effectiveAvailability is empty', () => {
    const slotStart = new Date("2026-07-06T10:00:00.000Z");
    const effectiveAvailability: Array<{
      startUtc: Date;
      endUtc: Date;
    }> = [];

    expect(
      availabilityIndicator(slotStart, effectiveAvailability, durationMinutes),
    ).toBe("unavailable");
  });

  it('returns "available" when there is a gap before the slot', () => {
    const slotStart = new Date("2026-07-06T12:00:00.000Z");
    const effectiveAvailability: Array<{
      startUtc: Date;
      endUtc: Date;
    }> = [
      {
        startUtc: new Date("2026-07-06T09:00:00.000Z"),
        endUtc: new Date("2026-07-06T10:00:00.000Z"),
      },
      {
        startUtc: new Date("2026-07-06T12:00:00.000Z"),
        endUtc: new Date("2026-07-06T13:00:00.000Z"),
      },
    ];

    expect(
      availabilityIndicator(slotStart, effectiveAvailability, durationMinutes),
    ).toBe("available");
  });
});
