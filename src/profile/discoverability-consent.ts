import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { discoverabilityConsents } from "../db/schema";

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
  {
    async findByUserId(userId) {
      const [row] = await getDb()
        .select({
          userId: discoverabilityConsents.userId,
          grantedAt: discoverabilityConsents.grantedAt,
        })
        .from(discoverabilityConsents)
        .where(eq(discoverabilityConsents.userId, userId))
        .limit(1);

      return row ?? null;
    },
    async grant(userId) {
      const inserted = await getDb()
        .insert(discoverabilityConsents)
        .values({ userId })
        .onConflictDoUpdate({
          target: discoverabilityConsents.userId,
          set: { grantedAt: new Date() },
        })
        .returning({
          userId: discoverabilityConsents.userId,
          grantedAt: discoverabilityConsents.grantedAt,
        });

      const [row] = inserted;
      if (!row) {
        throw new Error("discoverability_consent grant returned no row");
      }

      return row;
    },
    async revoke(userId) {
      await getDb()
        .delete(discoverabilityConsents)
        .where(eq(discoverabilityConsents.userId, userId));
    },
  };

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
