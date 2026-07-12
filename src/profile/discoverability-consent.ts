export type DiscoverabilityConsentRecord = {
  userId: string;
  grantedAt: Date;
};

export type DiscoverabilityConsentRepository = {
  findByUserId(userId: string): Promise<DiscoverabilityConsentRecord | null>;
  grant(userId: string): Promise<DiscoverabilityConsentRecord>;
  revoke(userId: string): Promise<void>;
};

let repositoryOverride: DiscoverabilityConsentRepository | null = null;

export function setDiscoverabilityConsentRepositoryForTests(
  repository: DiscoverabilityConsentRepository | null,
) {
  repositoryOverride = repository;
}

export function clearDiscoverabilityConsentOverride() {
  repositoryOverride = null;
}

export const discoverabilityConsentRepository: DiscoverabilityConsentRepository =
  defaultDiscoverabilityConsentRepository();

function defaultDiscoverabilityConsentRepository(): DiscoverabilityConsentRepository {
  return {
    async findByUserId() {
      await Promise.resolve();
      return null;
    },
    async grant(userId) {
      await Promise.resolve();
      return {
        userId,
        grantedAt: new Date(),
      };
    },
    async revoke() {
      await Promise.resolve();
      return;
    },
  };
}

function getRepository(): DiscoverabilityConsentRepository {
  return repositoryOverride ?? discoverabilityConsentRepository;
}

export async function getDiscoverabilityConsent(
  userId: string,
): Promise<DiscoverabilityConsentRecord | null> {
  return getRepository().findByUserId(userId);
}

export async function grantDiscoverabilityConsent(
  userId: string,
): Promise<DiscoverabilityConsentRecord> {
  return getRepository().grant(userId);
}

export async function revokeDiscoverabilityConsent(
  userId: string,
): Promise<void> {
  return getRepository().revoke(userId);
}
