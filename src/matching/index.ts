import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";

import {
  type Interval,
  type MatchingDependencies,
  findEligibleMatches,
} from "./find-eligible-matches";
import { computeEffectiveAvailability } from "./effective-availability";

import { getProfileByUserId } from "../profile/repository";
import { getTopicCatalogueRepository } from "../topics/repository";
import { listWeeklyAvailabilityWindowsByUserId } from "../profile/availability-windows";
import { listAvailabilityOverridesByUserId } from "../profile/availability-overrides";
import { getImportedBusyIntervalRepository } from "../calendar/imported-busy-intervals";
import { isUserEligibleForSearch } from "../search/eligibility";

export { findEligibleMatches };

export type { MatchingDependencies };

export function createMatchingDependencies(): MatchingDependencies {
  return {
    async listSelectedTopicIds(userId) {
      return getTopicCatalogueRepository().listSelectedTopicIds(userId);
    },
    computeEffectiveAvailability(inputs) {
      return computeEffectiveAvailability(inputs);
    },
    async getUserAvailabilityData(userId) {
      const [profile, windows, overrides, busyIntervals] = await Promise.all([
        getProfileByUserId(userId),
        listWeeklyAvailabilityWindowsByUserId(userId),
        listAvailabilityOverridesByUserId(userId),
        getImportedBusyIntervalRepository().findByUserIdAndDateRange(
          userId,
          new Date(0),
          new Date("2100-01-01"),
        ),
      ]);

      return {
        profileTimezone: profile?.profileTimezone ?? "UTC",
        bufferMinutes: profile?.bufferMinutes ?? 0,
        windows: windows as WeeklyAvailabilityWindow[],
        overrides: overrides as AvailabilityOverride[],
        busyIntervals: busyIntervals as ImportedBusyIntervalRecord[],
      };
    },
    async isUserEligibleForSearch(userId) {
      return isUserEligibleForSearch(userId);
    },
  };
}
