import {
  setWeeklyAvailabilityWindowRepositoryForTests,
  type WeeklyAvailabilityWindowRepository,
} from "./availability-windows";
import {
  setAvailabilityOverrideRepositoryForTests,
  type AvailabilityOverrideRepository,
} from "./availability-overrides";
import {
  setProfileRepositoryForTests,
  type ProfileRepository,
} from "./repository";

export type AvailabilityPageRepositories = {
  windows: WeeklyAvailabilityWindowRepository;
  overrides: AvailabilityOverrideRepository;
  profile: ProfileRepository;
};

let windowsOverride: WeeklyAvailabilityWindowRepository | null = null;
let overridesOverride: AvailabilityOverrideRepository | null = null;
let profileOverride: ProfileRepository | null = null;

export function setAvailabilityPageWindowRepositoryForTests(
  repository: WeeklyAvailabilityWindowRepository | null,
): void {
  windowsOverride = repository;
  setWeeklyAvailabilityWindowRepositoryForTests(repository);
}

export function setAvailabilityPageOverrideRepositoryForTests(
  repository: AvailabilityOverrideRepository | null,
): void {
  overridesOverride = repository;
  setAvailabilityOverrideRepositoryForTests(repository);
}

export function setAvailabilityPageProfileRepositoryForTests(
  repository: ProfileRepository | null,
): void {
  profileOverride = repository;
  setProfileRepositoryForTests(repository);
}

export function clearAvailabilityPageRepositoryOverrides(): void {
  windowsOverride = null;
  overridesOverride = null;
  profileOverride = null;
  setWeeklyAvailabilityWindowRepositoryForTests(null);
  setAvailabilityOverrideRepositoryForTests(null);
  setProfileRepositoryForTests(null);
}

export function buildAvailabilityPageRepositories(): AvailabilityPageRepositories {
  return {
    windows: windowsOverride ?? {
      add: () => {
        throw new Error(
          "windows repository not configured for availability page",
        );
      },
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(false),
    },
    overrides: overridesOverride ?? {
      add: () => {
        throw new Error(
          "overrides repository not configured for availability page",
        );
      },
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      removeById: () => Promise.resolve(false),
    },
    profile: profileOverride ?? {
      findByUserId: () => Promise.resolve(null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    },
  };
}
