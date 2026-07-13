import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";

export type Interval = { startUtc: Date; endUtc: Date };

export function hasAllSelectedTopics(
  selectedTopicIds: string[],
  userTopicIds: string[],
): boolean {
  return selectedTopicIds.every((id) => userTopicIds.includes(id));
}

export function hasFullDurationCoverage(
  intervals: Interval[],
  slotStart: Date,
  durationMinutes: number,
): boolean {
  if (intervals.length === 0) {
    return false;
  }

  const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

  let current = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();

  if (current >= slotEndMs) {
    return false;
  }

  for (const interval of intervals) {
    const intervalStartMs = interval.startUtc.getTime();
    const intervalEndMs = interval.endUtc.getTime();

    if (intervalStartMs > current) {
      return false;
    }

    if (intervalEndMs >= slotEndMs) {
      return true;
    }

    current = intervalEndMs;
    if (current >= slotEndMs) {
      return true;
    }
  }

  return false;
}

export type FindEligibleMatchesParams = {
  organizerId: string;
  selectedTopicIds: string[];
  candidateUserIds: string[];
  durationMinutes: number;
  rangeStart: Date;
  rangeEnd: Date;
  slotStart?: Date;
};

export type EffectiveAvailabilityInputs = {
  userId: string;
  profileTimezone: string;
  bufferMinutes: number;
  windows: WeeklyAvailabilityWindow[];
  overrides: AvailabilityOverride[];
  busyIntervals: ImportedBusyIntervalRecord[];
  rangeStart: Date;
  rangeEnd: Date;
};

export type MatchingDependencies = {
  listSelectedTopicIds: (userId: string) => Promise<string[]>;
  computeEffectiveAvailability: (inputs: EffectiveAvailabilityInputs) => Interval[];
  getUserAvailabilityData: (
    userId: string,
  ) => Promise<{
    profileTimezone: string;
    bufferMinutes: number;
    windows: WeeklyAvailabilityWindow[];
    overrides: AvailabilityOverride[];
    busyIntervals: ImportedBusyIntervalRecord[];
  }>;
  isUserEligibleForSearch: (userId: string) => Promise<boolean>;
};

export async function findEligibleMatches(
  params: FindEligibleMatchesParams,
  deps: MatchingDependencies,
): Promise<string[]> {
  const matches: string[] = [];

  for (const userId of params.candidateUserIds) {
    if (userId === params.organizerId) {
      continue;
    }

    if (!(await deps.isUserEligibleForSearch(userId))) {
      continue;
    }

    const userTopicIds = await deps.listSelectedTopicIds(userId);
    if (!hasAllSelectedTopics(params.selectedTopicIds, userTopicIds)) {
      continue;
    }

    if (params.slotStart != null) {
      const userAvail = await deps.getUserAvailabilityData(userId);
      const effectiveAvail = deps.computeEffectiveAvailability({
        ...userAvail,
        userId,
        rangeStart: params.rangeStart,
        rangeEnd: params.rangeEnd,
      });
      if (!hasFullDurationCoverage(effectiveAvail, params.slotStart, params.durationMinutes)) {
        continue;
      }
    }

    matches.push(userId);
  }

  return matches;
}
