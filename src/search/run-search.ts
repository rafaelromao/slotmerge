import type { Clock } from "./search-input";
import type { SearchInput } from "./search-input";
import type { SearchRecord } from "./repository";
import type {
  SearchResultRecord,
  SearchSnapshot,
  CalendarFreshness,
} from "./search-result-repository";

import {
  findEligibleMatches,
  type MatchingDependencies,
} from "../matching/find-eligible-matches";

import { generateHourlySlots } from "./hourly-slots";
import { availabilityIndicator } from "./match-detail";
import { deriveCalendarFreshness } from "./match-detail";

import type { DiscoverableUserRepository } from "./discoverable-user-repository";
import type { SearchResultRepository } from "./search-result-repository";
import type { ActiveTopicsRepository } from "./search-input";
import type { ProfileRepository } from "./search-input";

export type RunSearchDeps = {
  matchingDependencies: MatchingDependencies;
  discoverableUserRepository: DiscoverableUserRepository;
  clock: Clock;
  searchResultRepository: SearchResultRepository;
  topicRepository: ActiveTopicsRepository;
  profileRepository: ProfileRepository;
};

export type RunSearchParams = {
  searchRecord: SearchRecord;
  input: SearchInput;
};

export async function runSearch(
  params: RunSearchParams,
  deps: RunSearchDeps,
): Promise<SearchResultRecord> {
  const { searchRecord, input } = params;
  const {
    clock,
    searchResultRepository,
    matchingDependencies,
    discoverableUserRepository,
    topicRepository,
    profileRepository,
  } = deps;

  const candidateUserIds =
    await discoverableUserRepository.listDiscoverableUserIds(
      input.selectedTopicIds,
    );

  const slots = generateHourlySlots(input.dateRangeStart, input.dateRangeEnd);

  const topicMap = new Map(
    (await topicRepository.listActive()).map((t) => [t.id, t]),
  );

  const snapshotSlots: SearchSnapshot["slots"] = [];

  for (const slotStart of slots) {
    const matchUserIds = await findEligibleMatches(
      {
        organizerId: input.organizerId,
        selectedTopicIds: input.selectedTopicIds,
        candidateUserIds,
        durationMinutes: input.durationMinutes ?? 60,
        rangeStart: input.dateRangeStart,
        rangeEnd: input.dateRangeEnd,
        slotStart,
      },
      matchingDependencies,
    );

    const matches: SearchSnapshot["slots"][0]["matches"] = [];

    for (const userId of matchUserIds) {
      const [profile, userTopicIds, userAvailData] = await Promise.all([
        profileRepository.findByUserId(userId),
        matchingDependencies.listSelectedTopicIds(userId),
        matchingDependencies.getUserAvailabilityData(userId),
      ]);

      const effectiveAvail = matchingDependencies.computeEffectiveAvailability({
        ...userAvailData,
        userId,
        rangeStart: input.dateRangeStart,
        rangeEnd: input.dateRangeEnd,
      });

      const availIndicator = availabilityIndicator(
        slotStart,
        effectiveAvail,
        input.durationMinutes ?? 60,
      );

      const matchedTopics = userTopicIds
        .filter((id) => input.selectedTopicIds.includes(id))
        .map((id) => topicMap.get(id))
        .filter((t): t is NonNullable<typeof t> => t != null)
        .map((t) => ({ id: t.id, name: t.name }));

      let calendarFreshness: CalendarFreshness = "none";
      if (userAvailData.busyIntervals.length > 0) {
        const lastSync = userAvailData.busyIntervals.reduce(
          (latest, interval) => {
            if (!latest) return interval.importedAt;
            return interval.importedAt > latest ? interval.importedAt : latest;
          },
          null as Date | null,
        );
        calendarFreshness = deriveCalendarFreshness(lastSync, clock.now());
      }

      matches.push({
        userId,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        shortBio: profile?.shortBio ?? null,
        topics: matchedTopics,
        availabilityIndicator: availIndicator,
        calendarFreshness,
      });
    }

    snapshotSlots.push({
      startUtc: slotStart.toISOString(),
      matchCount: matches.length,
      matches,
    });
  }

  const snapshot: SearchSnapshot = {
    generatedAt: clock.now().toISOString(),
    organizerTimezone: input.organizerTimezone,
    dateRangeStart: input.dateRangeStart.toISOString(),
    dateRangeEnd: input.dateRangeEnd.toISOString(),
    durationMinutes: input.durationMinutes ?? 60,
    slots: snapshotSlots,
  };

  const resultRecord: SearchResultRecord = {
    searchId: searchRecord.id!,
    snapshotJson: snapshot,
    createdAt: clock.now(),
  };

  return searchResultRepository.save(resultRecord);
}
