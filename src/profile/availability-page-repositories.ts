import {
  setWeeklyAvailabilityWindowRepositoryForTests,
  createPostgresWeeklyAvailabilityWindowRepository,
  type WeeklyAvailabilityWindowRepository,
} from "./availability-windows";
import {
  setAvailabilityOverrideRepositoryForTests,
  createPostgresAvailabilityOverrideRepository,
  type AvailabilityOverrideRepository,
} from "./availability-overrides";
import {
  setProfileRepositoryForTests,
  createPostgresProfileRepository,
  type ProfileRepository,
} from "./repository";
import { systemClock } from "../system/clock";

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
    windows:
      windowsOverride ??
      createPostgresWeeklyAvailabilityWindowRepository(systemClock()),
    overrides:
      overridesOverride ?? createPostgresAvailabilityOverrideRepository(),
    profile: profileOverride ?? createPostgresProfileRepository(systemClock()),
  };
}
