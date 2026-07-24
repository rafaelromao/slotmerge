import type { UserProfile } from "../../src/profile/repository";
import type { Clock } from "../../src/system/clock";

export { InMemorySearchResultRepository } from "../../src/search/search-result-in-memory-repository";

import type { SearchSnapshotAssemblerDeps } from "../../src/search/search-snapshot-assembler";
import type { DiscoverableUserRepository } from "../../src/search/discoverable-user-repository";

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
