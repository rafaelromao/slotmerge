import { describe, expect, it } from "vitest";
import {
  findEligibleMatches,
  hasAllSelectedTopics,
  hasFullDurationCoverage,
  type Interval,
  type MatchingDependencies,
} from "./find-eligible-matches";

describe("hasAllSelectedTopics", () => {
  it("returns true when user has all selected topics", () => {
    const selectedTopicIds = ["topic-a", "topic-b", "topic-c"];
    const userTopicIds = ["topic-a", "topic-b", "topic-c", "topic-d"];
    expect(hasAllSelectedTopics(selectedTopicIds, userTopicIds)).toBe(true);
  });

  it("returns true when user has exactly the selected topics", () => {
    const selectedTopicIds = ["topic-a", "topic-b"];
    const userTopicIds = ["topic-a", "topic-b"];
    expect(hasAllSelectedTopics(selectedTopicIds, userTopicIds)).toBe(true);
  });

  it("returns false when user is missing one topic", () => {
    const selectedTopicIds = ["topic-a", "topic-b", "topic-c"];
    const userTopicIds = ["topic-a", "topic-b"];
    expect(hasAllSelectedTopics(selectedTopicIds, userTopicIds)).toBe(false);
  });

  it("returns false when user has no topics", () => {
    const selectedTopicIds = ["topic-a"];
    const userTopicIds: string[] = [];
    expect(hasAllSelectedTopics(selectedTopicIds, userTopicIds)).toBe(false);
  });

  it("returns true when selected topics is empty", () => {
    const selectedTopicIds: string[] = [];
    const userTopicIds = ["topic-a", "topic-b"];
    expect(hasAllSelectedTopics(selectedTopicIds, userTopicIds)).toBe(true);
  });

  it("returns false when user topics is empty and selected is not", () => {
    const selectedTopicIds = ["topic-a"];
    const userTopicIds: string[] = [];
    expect(hasAllSelectedTopics(selectedTopicIds, userTopicIds)).toBe(false);
  });
});

describe("hasFullDurationCoverage", () => {
  it("returns true when availability covers the full slot duration", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T09:00:00Z"),
        endUtc: new Date("2026-07-13T17:00:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T10:00:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      true,
    );
  });

  it("returns false when availability ends before slot ends", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T09:00:00Z"),
        endUtc: new Date("2026-07-13T10:30:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T10:00:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      false,
    );
  });

  it("returns true when multiple merged intervals cover the slot", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T09:00:00Z"),
        endUtc: new Date("2026-07-13T12:00:00Z"),
      },
      {
        startUtc: new Date("2026-07-13T13:00:00Z"),
        endUtc: new Date("2026-07-13T17:00:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T10:00:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      true,
    );
  });

  it("returns false when gap exists in middle of slot", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T09:00:00Z"),
        endUtc: new Date("2026-07-13T12:00:00Z"),
      },
      {
        startUtc: new Date("2026-07-13T13:00:00Z"),
        endUtc: new Date("2026-07-13T17:00:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T12:30:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      false,
    );
  });

  it("returns false when slot starts before any availability", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T09:00:00Z"),
        endUtc: new Date("2026-07-13T17:00:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T08:00:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      false,
    );
  });

  it("returns true for exact coverage", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T10:00:00Z"),
        endUtc: new Date("2026-07-13T11:00:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T10:00:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      true,
    );
  });

  it("returns false when no intervals provided", () => {
    const intervals: Interval[] = [];
    const slotStart = new Date("2026-07-13T10:00:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      false,
    );
  });

  it("returns false when slot duration extends beyond last interval end", () => {
    const intervals: Interval[] = [
      {
        startUtc: new Date("2026-07-13T09:00:00Z"),
        endUtc: new Date("2026-07-13T11:00:00Z"),
      },
    ];
    const slotStart = new Date("2026-07-13T10:30:00Z");
    const durationMinutes = 60;
    expect(hasFullDurationCoverage(intervals, slotStart, durationMinutes)).toBe(
      false,
    );
  });
});

describe("findEligibleMatches", () => {
  const createMockDeps = (
    overrides: Partial<MatchingDependencies> = {},
  ): MatchingDependencies => {
    return {
      listSelectedTopicIds: () => Promise.resolve([]),
      computeEffectiveAvailability: () => [],
      getUserAvailabilityData: () =>
        Promise.resolve({
          profileTimezone: "UTC",
          bufferMinutes: 0,
          windows: [],
          overrides: [],
          busyIntervals: [],
        }),
      isUserEligibleForSearch: () => Promise.resolve(true),
      ...overrides,
    };
  };

  it("excludes the organizer from results (AC6)", async () => {
    const deps = createMockDeps({
      listSelectedTopicIds: () => Promise.resolve(["topic-a"]),
      isUserEligibleForSearch: () => Promise.resolve(true),
    });
    const result = await findEligibleMatches(
      {
        organizerId: "user-1",
        selectedTopicIds: ["topic-a"],
        candidateUserIds: ["user-1", "user-2"],
        durationMinutes: 60,
        rangeStart: new Date("2026-07-13T00:00:00Z"),
        rangeEnd: new Date("2026-07-14T00:00:00Z"),
      },
      deps,
    );
    expect(result).toEqual(["user-2"]);
  });

  it("excludes users missing a selected topic (AC1)", async () => {
    const deps = createMockDeps({
      listSelectedTopicIds: (userId: string) =>
        Promise.resolve(
          userId === "user-1"
            ? ["topic-a", "topic-b"]
            : userId === "user-2"
              ? ["topic-a"]
              : [],
        ),
      isUserEligibleForSearch: () => Promise.resolve(true),
    });
    const result = await findEligibleMatches(
      {
        organizerId: "organizer",
        selectedTopicIds: ["topic-a", "topic-b"],
        candidateUserIds: ["user-1", "user-2"],
        durationMinutes: 60,
        rangeStart: new Date("2026-07-13T00:00:00Z"),
        rangeEnd: new Date("2026-07-14T00:00:00Z"),
      },
      deps,
    );
    expect(result).toEqual(["user-1"]);
  });

  it("excludes users who are not eligible (AC3/4/5)", async () => {
    const deps = createMockDeps({
      listSelectedTopicIds: () => Promise.resolve(["topic-a"]),
      isUserEligibleForSearch: (userId: string) =>
        Promise.resolve(userId === "user-1"),
    });
    const result = await findEligibleMatches(
      {
        organizerId: "organizer",
        selectedTopicIds: ["topic-a"],
        candidateUserIds: ["user-1", "user-2"],
        durationMinutes: 60,
        rangeStart: new Date("2026-07-13T00:00:00Z"),
        rangeEnd: new Date("2026-07-14T00:00:00Z"),
      },
      deps,
    );
    expect(result).toEqual(["user-1"]);
  });

  it("returns users who meet all criteria", async () => {
    const deps = createMockDeps({
      listSelectedTopicIds: () => Promise.resolve(["topic-a", "topic-b"]),
      isUserEligibleForSearch: () => Promise.resolve(true),
    });
    const result = await findEligibleMatches(
      {
        organizerId: "organizer",
        selectedTopicIds: ["topic-a", "topic-b"],
        candidateUserIds: ["user-1", "user-2", "user-3"],
        durationMinutes: 60,
        rangeStart: new Date("2026-07-13T00:00:00Z"),
        rangeEnd: new Date("2026-07-14T00:00:00Z"),
      },
      deps,
    );
    expect(result).toEqual(["user-1", "user-2", "user-3"]);
  });

  it("returns empty array when no users meet criteria", async () => {
    const deps = createMockDeps({
      listSelectedTopicIds: () => Promise.resolve([]),
      isUserEligibleForSearch: () => Promise.resolve(false),
    });
    const result = await findEligibleMatches(
      {
        organizerId: "organizer",
        selectedTopicIds: ["topic-a"],
        candidateUserIds: ["user-1"],
        durationMinutes: 60,
        rangeStart: new Date("2026-07-13T00:00:00Z"),
        rangeEnd: new Date("2026-07-14T00:00:00Z"),
      },
      deps,
    );
    expect(result).toEqual([]);
  });

  it("handles empty candidate pool", async () => {
    const deps = createMockDeps();
    const result = await findEligibleMatches(
      {
        organizerId: "organizer",
        selectedTopicIds: ["topic-a"],
        candidateUserIds: [],
        durationMinutes: 60,
        rangeStart: new Date("2026-07-13T00:00:00Z"),
        rangeEnd: new Date("2026-07-14T00:00:00Z"),
      },
      deps,
    );
    expect(result).toEqual([]);
  });
});
