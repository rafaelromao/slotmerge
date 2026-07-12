import { getDiscoverabilityConsent } from "../profile/discoverability-consent";

export type ProfileInputs = {
  hasDisplayName: boolean;
  hasTopicOrProposal: boolean;
  hasAvailabilitySource: boolean;
  isActive?: boolean;
};

export function isEligibleForSearch(
  profile: ProfileInputs | null | undefined,
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

export async function isUserEligibleForSearch(
  userId: string,
): Promise<boolean> {
  return isEligibleForSearchFromProfileSources(userId);
}

export type ProfileInputsResolver = (
  userId: string,
) => Promise<ProfileInputs | null> | ProfileInputs | null;

let profileInputsResolverOverride: ProfileInputsResolver | null = null;

export function setSearchEligibilityProfileInputsForTests(
  inputs: Record<string, ProfileInputs> | null,
) {
  if (inputs === null) {
    profileInputsResolverOverride = null;
    return;
  }

  profileInputsResolverOverride = (userId) =>
    Promise.resolve(inputs[userId] ?? null);
}

const fallbackProfileInputs: ProfileInputsResolver = () => null;

export async function isEligibleForSearchFromProfileSources(
  userId: string,
): Promise<boolean> {
  const resolver = profileInputsResolverOverride ?? fallbackProfileInputs;
  const [inputs, consent] = await Promise.all([
    resolver(userId),
    getDiscoverabilityConsent(userId),
  ]);

  return isEligibleForSearch(inputs, consent !== null);
}
