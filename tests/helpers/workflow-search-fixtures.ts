import type { UserProfile } from "../../src/profile/repository";
import type { Clock } from "../../src/system/clock";

export { InMemorySearchResultRepository } from "../../src/search/search-result-in-memory-repository";

import type { SearchSnapshotAssemblerDeps } from "../../src/search/search-snapshot-assembler";
import type { DiscoverableUserRepository } from "../../src/search/discoverable-user-repository";
import type { WeeklyAvailabilityWindow } from "../../src/profile/availability-windows";
import type { AvailabilityOverride } from "../../src/profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../../src/calendar/imported-busy-intervals";

import type {
  ActiveTopicsRepository,
  ProfileRepository,
} from "../../src/search/search-input";

export class InMemoryActiveTopicsRepository implements ActiveTopicsRepository {
  constructor(
    private readonly activeTopics: Array<{ id: string; name: string }> = [],
  ) {}

  async listActive() {
    await Promise.resolve();
    return this.activeTopics.map((t) => ({
      id: t.id,
      name: t.name,
      status: "active" as const,
    }));
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  constructor(private readonly profile: UserProfile | null) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    await Promise.resolve();
    if (!this.profile) return null;
    if (this.profile.id !== userId) return null;
    return this.profile;
  }
}

export class InMemoryDiscoverableUserRepository implements DiscoverableUserRepository {
  constructor(private readonly userIds: string[] = []) {}

  async listDiscoverableUserIds(): Promise<string[]> {
    await Promise.resolve();
    return [...this.userIds];
  }
}

export const pinnedClock = (iso: string): Clock => ({
  now: () => new Date(iso),
});

export const organizerProfile: UserProfile = {
  id: "organizer-1",
  email: "organizer@example.com",
  displayName: "Organizer",
  avatarUrl: null,
  shortBio: null,
  role: "organizer",
  status: "active",
  profileTimezone: "America/Sao_Paulo",
  bufferMinutes: 0,
};

export const utcProfile: UserProfile = {
  ...organizerProfile,
  id: "organizer-2",
  profileTimezone: null,
};

export const mockAssemblerDeps: SearchSnapshotAssemblerDeps = {
  discoverableUserRepository: new InMemoryDiscoverableUserRepository(),
  topicRepository: new InMemoryActiveTopicsRepository(),
  profileRepository: new InMemoryProfileRepository(null),
  listSelectedTopicIds() {
    return Promise.resolve([]);
  },
  loadUserAvailabilityData() {
    return Promise.resolve({
      windows: [],
      overrides: [],
      busyIntervals: [],
    });
  },
  loadCalendarConnectionLastSyncAt() {
    return Promise.resolve(null);
  },
  getDiscoverabilityConsent() {
    return Promise.resolve(null);
  },
  hasTopicProposal() {
    return Promise.resolve(false);
  },
  computeEffectiveAvailability() {
    return [];
  },
  deriveCalendarFreshness() {
    return "none" as const;
  },
};

export function makeEligibleAssemblerDeps(
  eligibleUserIds: string[],
  activeTopics: Array<{ id: string; name: string }> = [
    { id: "topic-1", name: "Product strategy" },
  ],
  discoverableUserRepository: DiscoverableUserRepository = new InMemoryDiscoverableUserRepository(
    eligibleUserIds,
  ),
): SearchSnapshotAssemblerDeps {
  const eligible = new Set(eligibleUserIds);
  const availabilityWindows = [
    {
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "17:00",
    },
  ] as WeeklyAvailabilityWindow[];
  const availabilityOverrides = [] as AvailabilityOverride[];
  const busyIntervals = [] as ImportedBusyIntervalRecord[];

  return {
    discoverableUserRepository,
    topicRepository: new InMemoryActiveTopicsRepository(activeTopics),
    profileRepository: {
      findByUserId(userId: string): Promise<UserProfile | null> {
        if (!eligible.has(userId)) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: userId,
          email: `${userId}@example.com`,
          displayName: `Eligible ${userId}`,
          avatarUrl: null,
          shortBio: null,
          role: "organizer",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
        });
      },
    },
    listSelectedTopicIds(userId: string): Promise<string[]> {
      return Promise.resolve(
        eligible.has(userId) ? activeTopics.map((topic) => topic.id) : [],
      );
    },
    loadUserAvailabilityData() {
      return Promise.resolve({
        windows: availabilityWindows,
        overrides: availabilityOverrides,
        busyIntervals,
      });
    },
    loadCalendarConnectionLastSyncAt() {
      return Promise.resolve(null);
    },
    getDiscoverabilityConsent(userId: string) {
      if (!eligible.has(userId)) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        state: "granted" as const,
        grantedAt: new Date("2026-07-12T12:00:00.000Z"),
      });
    },
    hasTopicProposal(userId: string) {
      return Promise.resolve(eligible.has(userId));
    },
    computeEffectiveAvailability(inputs) {
      return eligible.has(inputs.userId)
        ? [
            {
              startUtc: new Date("2026-07-13T15:00:00.000Z"),
              endUtc: new Date("2026-07-13T18:00:00.000Z"),
            },
          ]
        : [];
    },
    deriveCalendarFreshness() {
      return "none" as const;
    },
  };
}
