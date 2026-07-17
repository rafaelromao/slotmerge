import { eq } from "drizzle-orm";

import type { Clock } from "./search-input";
import type { ActiveTopicsRepository } from "./search-input";
import type { DiscoverableUserRepository } from "./discoverable-user-repository";
import type {
  SearchSnapshot,
  Slot,
  SlotMatchDetail,
} from "./search-result-repository";
import type { UserProfile } from "../profile/repository";
import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";
import type { DiscoverabilityConsentRecord } from "../profile/discoverability-consent";
import type {
  AvailabilityIndicator,
  CalendarFreshness,
  TopicDetail,
} from "../db/schema";
import { topicProposals } from "../db/schema";
import { getDb } from "../db/client";
import { getDiscoverabilityConsent } from "../profile/discoverability-consent";
import { getTopicCatalogueRepository } from "../topics/repository";
import { listWeeklyAvailabilityWindowsByUserId } from "../profile/availability-windows";
import { listAvailabilityOverridesByUserId } from "../profile/availability-overrides";
import { getImportedBusyIntervalRepository } from "../calendar/imported-busy-intervals";
import { getProfileByUserId } from "../profile/repository";

import type { Interval } from "../matching/effective-availability";
import { computeEffectiveAvailability } from "../matching/effective-availability";
import { availabilityIndicator, deriveCalendarFreshness } from "./match-detail";
import { generateHourlySlots } from "./hourly-slots";

export type SearchSnapshotAssemblerInput = {
  organizerId: string;
  selectedTopicIds: string[];
  durationMinutes: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
  minimumMatchingUsers: number;
};

export type UserAvailabilityData = {
  profileTimezone: string;
  bufferMinutes: number;
  windows: WeeklyAvailabilityWindow[];
  overrides: AvailabilityOverride[];
  busyIntervals: ImportedBusyIntervalRecord[];
};

export type SearchSnapshotAssemblerDeps = {
  clock: Clock;
  discoverableUserRepository: DiscoverableUserRepository;
  topicRepository: ActiveTopicsRepository;
  profileRepository: {
    findByUserId(userId: string): Promise<UserProfile | null>;
  };
  listSelectedTopicIds(userId: string): Promise<string[]>;
  loadUserAvailabilityData(
    userId: string,
    range: { rangeStart: Date; rangeEnd: Date },
  ): Promise<UserAvailabilityData>;
  getDiscoverabilityConsent(
    userId: string,
  ): Promise<DiscoverabilityConsentRecord | null>;
  hasTopicProposal(userId: string): Promise<boolean>;
  computeEffectiveAvailability(inputs: {
    userId: string;
    profileTimezone: string;
    bufferMinutes: number;
    windows: WeeklyAvailabilityWindow[];
    overrides: AvailabilityOverride[];
    busyIntervals: ImportedBusyIntervalRecord[];
    rangeStart: Date;
    rangeEnd: Date;
  }): Interval[];
  deriveCalendarFreshness(
    lastSyncAt: Date | null,
    now: Date,
  ): CalendarFreshness;
};

export type CandidatePreparation = {
  userId: string;
  profile: UserProfile | null;
  selectedTopicIds: string[];
  effectiveAvailability: Interval[];
  displayName: string | null;
  avatarUrl: string | null;
  shortBio: string | null;
  matchedTopics: TopicDetail[];
  topicProfileDetails: TopicDetail[];
  availabilityBySlot: Map<string, AvailabilityIndicator>;
  calendarFreshness: CalendarFreshness;
};

export class SearchSnapshotAssembler {
  constructor(private readonly deps: SearchSnapshotAssemblerDeps) {}

  async assemble(input: SearchSnapshotAssemblerInput): Promise<SearchSnapshot> {
    const now = this.deps.clock.now();

    const activeTopics = await this.deps.topicRepository.listActive();
    const topicMap = new Map(activeTopics.map((t) => [t.id, t]));

    const candidateUserIds =
      await this.deps.discoverableUserRepository.listDiscoverableUserIds(
        input.selectedTopicIds,
      );

    const slots = generateHourlySlots(
      input.dateRangeStart,
      input.dateRangeEnd,
      input.organizerTimezone,
    );

    const prepared = await Promise.all(
      candidateUserIds
        .filter((userId) => userId !== input.organizerId)
        .map((userId) => this.prepareCandidate(userId, input, now, topicMap)),
    );

    const eligible = prepared.filter((c) => c !== null);

    const snapshotSlots: Slot[] = [];
    for (const slotStart of slots) {
      const slotKey = slotStart.toISOString();
      const matches: SlotMatchDetail[] = [];
      for (const candidate of eligible) {
        const indicator = candidate.availabilityBySlot.get(slotKey);
        if (indicator !== "available") {
          continue;
        }
        matches.push({
          userId: candidate.userId,
          displayName: candidate.displayName,
          avatarUrl: candidate.avatarUrl,
          shortBio: candidate.shortBio,
          topics: candidate.matchedTopics,
          topicProfile: candidate.topicProfileDetails,
          availabilityIndicator: indicator,
          calendarFreshness: candidate.calendarFreshness,
        });
      }
      if (matches.length >= input.minimumMatchingUsers) {
        snapshotSlots.push({
          startUtc: slotKey,
          matchCount: matches.length,
          matches,
        });
      }
    }

    return {
      generatedAt: now.toISOString(),
      organizerTimezone: input.organizerTimezone,
      dateRangeStart: input.dateRangeStart.toISOString(),
      dateRangeEnd: input.dateRangeEnd.toISOString(),
      durationMinutes: input.durationMinutes,
      slots: snapshotSlots,
    };
  }

  private async prepareCandidate(
    userId: string,
    input: SearchSnapshotAssemblerInput,
    now: Date,
    topicMap: Map<string, { id: string; name: string; status: "active" }>,
  ): Promise<CandidatePreparation | null> {
    const [profile, consent, hasTopicProposal, availabilityData] =
      await Promise.all([
        this.deps.profileRepository.findByUserId(userId),
        this.deps.getDiscoverabilityConsent(userId),
        this.deps.hasTopicProposal(userId),
        this.deps.loadUserAvailabilityData(userId, {
          rangeStart: input.dateRangeStart,
          rangeEnd: input.dateRangeEnd,
        }),
      ]);

    const selectedTopicIds = await this.deps.listSelectedTopicIds(userId);

    const profileInputs = {
      hasDisplayName: !!profile?.displayName?.trim(),
      hasTopicOrProposal: selectedTopicIds.length > 0 || hasTopicProposal,
      hasAvailabilitySource:
        availabilityData.windows.length > 0 ||
        availabilityData.busyIntervals.length > 0,
      isActive: profile?.status === "active",
    };

    const hasConsent = consent !== null;
    if (!isEligibleForSearch(profileInputs, hasConsent)) {
      return null;
    }

    const hasAllSelected = input.selectedTopicIds.every((id) =>
      selectedTopicIds.includes(id),
    );
    if (!hasAllSelected) {
      return null;
    }

    const effectiveAvailability = this.deps.computeEffectiveAvailability({
      userId,
      profileTimezone: availabilityData.profileTimezone,
      bufferMinutes: availabilityData.bufferMinutes,
      windows: availabilityData.windows,
      overrides: availabilityData.overrides,
      busyIntervals: availabilityData.busyIntervals,
      rangeStart: input.dateRangeStart,
      rangeEnd: input.dateRangeEnd,
    });

    const slots = generateHourlySlots(
      input.dateRangeStart,
      input.dateRangeEnd,
      input.organizerTimezone,
    );
    const availabilityBySlot = new Map<string, AvailabilityIndicator>();
    for (const slotStart of slots) {
      const indicator = availabilityIndicator(
        slotStart,
        effectiveAvailability,
        input.durationMinutes,
      );
      availabilityBySlot.set(slotStart.toISOString(), indicator);
    }

    const lastSyncAt = availabilityData.busyIntervals.reduce<Date | null>(
      (latest, interval) => {
        if (!latest) return interval.importedAt;
        return interval.importedAt > latest ? interval.importedAt : latest;
      },
      null,
    );
    const calendarFreshness = this.deps.deriveCalendarFreshness(
      lastSyncAt,
      now,
    );

    const matchedTopics: TopicDetail[] = selectedTopicIds
      .filter((id) => input.selectedTopicIds.includes(id))
      .map((id) => topicMap.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null)
      .map((t) => ({ id: t.id, name: t.name }));

    const topicProfileDetails: TopicDetail[] = selectedTopicIds
      .map((id) => topicMap.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null)
      .map((t) => ({ id: t.id, name: t.name }));

    return {
      userId,
      profile,
      selectedTopicIds,
      effectiveAvailability,
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      shortBio: profile?.shortBio ?? null,
      matchedTopics,
      topicProfileDetails,
      availabilityBySlot,
      calendarFreshness,
    };
  }
}

export type ProfileInputs = {
  hasDisplayName: boolean;
  hasTopicOrProposal: boolean;
  hasAvailabilitySource: boolean;
  isActive?: boolean;
};

export function isEligibleForSearch(
  profile: ProfileInputs | null,
  hasConsent: boolean,
): boolean {
  if (!hasConsent) {
    return false;
  }

  if (!profile) {
    return false;
  }

  if (profile.isActive === false) {
    return false;
  }

  return (
    profile.hasDisplayName &&
    profile.hasTopicOrProposal &&
    profile.hasAvailabilitySource
  );
}

export function createDefaultSearchSnapshotAssemblerDeps(
  deps: Pick<
    SearchSnapshotAssemblerDeps,
    | "clock"
    | "discoverableUserRepository"
    | "topicRepository"
    | "profileRepository"
  >,
): SearchSnapshotAssemblerDeps {
  return {
    clock: deps.clock,
    discoverableUserRepository: deps.discoverableUserRepository,
    topicRepository: deps.topicRepository,
    profileRepository: deps.profileRepository,
    listSelectedTopicIds: (userId) =>
      getTopicCatalogueRepository().listSelectedTopicIds(userId),
    loadUserAvailabilityData: async (userId, range) => {
      const [profile, windows, overrides, busyIntervals] = await Promise.all([
        getProfileByUserId(userId),
        listWeeklyAvailabilityWindowsByUserId(userId),
        listAvailabilityOverridesByUserId(userId),
        getImportedBusyIntervalRepository().findByUserIdAndDateRange(
          userId,
          range.rangeStart,
          range.rangeEnd,
        ),
      ]);
      return {
        profileTimezone: profile?.profileTimezone ?? "UTC",
        bufferMinutes: profile?.bufferMinutes ?? 0,
        windows,
        overrides,
        busyIntervals,
      };
    },
    getDiscoverabilityConsent: (userId) => getDiscoverabilityConsent(userId),
    hasTopicProposal: (userId) => hasAnyTopicProposal(userId),
    computeEffectiveAvailability: (inputs) =>
      computeEffectiveAvailability(inputs),
    deriveCalendarFreshness: (lastSyncAt, now) =>
      deriveCalendarFreshness(lastSyncAt, now),
  };
}

async function hasAnyTopicProposal(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: topicProposals.id })
    .from(topicProposals)
    .where(eq(topicProposals.proposedByUserId, userId))
    .limit(1);
  return rows.length > 0;
}
