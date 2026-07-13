import { describe, expect, it } from "vitest";
import type { SearchSnapshot, Slot } from "../../src/db/schema";
import {
  alignToMonday,
  getNextWeekStart,
  getPreviousWeekStart,
  getSlotsForWeek,
  slotHasStaleMatch,
} from "../../src/search/calendar-utils";

function createSnapshot(slots: Slot[]): SearchSnapshot {
  return {
    generatedAt: "2026-01-01T00:00:00Z",
    organizerTimezone: "UTC",
    dateRangeStart: "2026-01-01T00:00:00Z",
    dateRangeEnd: "2026-01-31T00:00:00Z",
    durationMinutes: 60,
    slots,
  };
}

describe("calendar-utils", () => {
  describe("getSlotsForWeek", () => {
    it("returns slots within the week range", () => {
      const snapshot = createSnapshot([
        {
          startUtc: "2026-01-06T09:00:00Z",
          matchCount: 2,
          matches: [],
        },
        {
          startUtc: "2026-01-06T10:00:00Z",
          matchCount: 3,
          matches: [],
        },
        {
          startUtc: "2026-01-13T09:00:00Z",
          matchCount: 1,
          matches: [],
        },
      ]);

      const weekStart = new Date("2026-01-05T00:00:00Z");
      const result = getSlotsForWeek(snapshot, weekStart);

      expect(result).toHaveLength(2);
      expect(result[0].startUtc).toBe("2026-01-06T09:00:00Z");
      expect(result[1].startUtc).toBe("2026-01-06T10:00:00Z");
    });

    it("excludes slots outside the week range", () => {
      const snapshot = createSnapshot([
        {
          startUtc: "2026-01-06T09:00:00Z",
          matchCount: 2,
          matches: [],
        },
        {
          startUtc: "2026-01-13T09:00:00Z",
          matchCount: 1,
          matches: [],
        },
      ]);

      const weekStart = new Date("2026-01-05T00:00:00Z");
      const result = getSlotsForWeek(snapshot, weekStart);

      expect(result).toHaveLength(1);
      expect(result[0].startUtc).toBe("2026-01-06T09:00:00Z");
    });

    it("returns empty array when no slots match", () => {
      const snapshot = createSnapshot([
        {
          startUtc: "2026-02-06T09:00:00Z",
          matchCount: 2,
          matches: [],
        },
      ]);

      const weekStart = new Date("2026-01-05T00:00:00Z");
      const result = getSlotsForWeek(snapshot, weekStart);

      expect(result).toHaveLength(0);
    });
  });

  describe("slotHasStaleMatch", () => {
    it("returns true when any match has stale calendar freshness", () => {
      const slot: Slot = {
        startUtc: "2026-01-06T09:00:00Z",
        matchCount: 2,
        matches: [
          {
            userId: "user1",
            displayName: "Alice",
            avatarUrl: null,
            shortBio: null,
            topics: [],
            availabilityIndicator: "available",
            calendarFreshness: "fresh",
          },
          {
            userId: "user2",
            displayName: "Bob",
            avatarUrl: null,
            shortBio: null,
            topics: [],
            availabilityIndicator: "available",
            calendarFreshness: "stale",
          },
        ],
      };

      expect(slotHasStaleMatch(slot)).toBe(true);
    });

    it("returns false when all matches are fresh or none", () => {
      const slot: Slot = {
        startUtc: "2026-01-06T09:00:00Z",
        matchCount: 2,
        matches: [
          {
            userId: "user1",
            displayName: "Alice",
            avatarUrl: null,
            shortBio: null,
            topics: [],
            availabilityIndicator: "available",
            calendarFreshness: "fresh",
          },
          {
            userId: "user2",
            displayName: "Bob",
            avatarUrl: null,
            shortBio: null,
            topics: [],
            availabilityIndicator: "available",
            calendarFreshness: "none",
          },
        ],
      };

      expect(slotHasStaleMatch(slot)).toBe(false);
    });

    it("returns false for slot with no matches", () => {
      const slot: Slot = {
        startUtc: "2026-01-06T09:00:00Z",
        matchCount: 0,
        matches: [],
      };

      expect(slotHasStaleMatch(slot)).toBe(false);
    });
  });

  describe("getPreviousWeekStart", () => {
    it("returns previous week when within 90-day window", () => {
      const currentWeekStart = new Date("2026-07-13T00:00:00Z");
      const today = new Date("2026-07-13T00:00:00Z");

      const result = getPreviousWeekStart(currentWeekStart, today);

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(new Date("2026-07-06T00:00:00Z").getTime());
    });

    it("returns previous week when current week is within 90 days", () => {
      const currentWeekStart = new Date("2026-05-01T00:00:00Z");
      const today = new Date("2026-07-13T00:00:00Z");

      const result = getPreviousWeekStart(currentWeekStart, today);

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(new Date("2026-04-24T00:00:00Z").getTime());
    });

    it("returns null when previous week would be before 90-day window", () => {
      const currentWeekStart = new Date("2026-04-20T00:00:00Z");
      const today = new Date("2026-07-13T00:00:00Z");

      const result = getPreviousWeekStart(currentWeekStart, today);

      expect(result).toBeNull();
    });

    it("allows navigation to week just at the 90-day boundary", () => {
      const currentWeekStart = new Date("2026-04-21T00:00:00Z");
      const today = new Date("2026-07-13T00:00:00Z");

      const result = getPreviousWeekStart(currentWeekStart, today);

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(new Date("2026-04-14T00:00:00Z").getTime());
    });
  });

  describe("getNextWeekStart", () => {
    it("returns next week when before date range end", () => {
      const currentWeekStart = new Date("2026-07-06T00:00:00Z");
      const snapshotDateRangeEnd = new Date("2026-08-17T00:00:00Z");

      const result = getNextWeekStart(currentWeekStart, snapshotDateRangeEnd);

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(new Date("2026-07-13T00:00:00Z").getTime());
    });

    it("returns null when next week would be at or after date range end", () => {
      const currentWeekStart = new Date("2026-08-10T00:00:00Z");
      const snapshotDateRangeEnd = new Date("2026-08-17T00:00:00Z");

      const result = getNextWeekStart(currentWeekStart, snapshotDateRangeEnd);

      expect(result).toBeNull();
    });
  });

  describe("alignToMonday (startOfWeekInTimezone)", () => {
    it("aligns a Wednesday to the preceding Monday", () => {
      const date = new Date("2026-07-15T12:00:00Z");
      const result = alignToMonday(date, "UTC");

      expect(result.getTime()).toBe(new Date("2026-07-13T00:00:00Z").getTime());
    });

    it("keeps a Monday as Monday", () => {
      const date = new Date("2026-07-13T00:00:00Z");
      const result = alignToMonday(date, "UTC");

      expect(result.getTime()).toBe(new Date("2026-07-13T00:00:00Z").getTime());
    });

    it("aligns a Sunday to the preceding Monday", () => {
      const date = new Date("2026-07-19T23:59:59Z");
      const result = alignToMonday(date, "UTC");

      expect(result.getTime()).toBe(new Date("2026-07-13T00:00:00Z").getTime());
    });

    it("handles timezone offset correctly", () => {
      const date = new Date("2026-07-15T03:00:00Z");
      const result = alignToMonday(date, "America/New_York");

      expect(result.getTime()).toBe(new Date("2026-07-13T04:00:00Z").getTime());
    });
  });
});