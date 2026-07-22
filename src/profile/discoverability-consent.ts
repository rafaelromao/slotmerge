import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { discoverabilityConsents } from "../db/schema";
import type { Clock } from "../system/clock";
import { systemClock } from "../system/clock";

export type DiscoverabilityConsentGrant = {
  state: "granted";
  grantedAt: Date;
};

export type DiscoverabilityConsentRevoke = {
  state: "revoked";
  revokedAt: Date;
};

export type DiscoverabilityConsentState =
  DiscoverabilityConsentGrant | DiscoverabilityConsentRevoke;

export type DiscoverabilityConsentRecord = DiscoverabilityConsentState;

export type GrantedConsentRecord = {
  userId: string;
  grantedAt: Date;
};

export type RevokedConsentRecord = {
  userId: string;
  revokedAt: Date;
};

export type DiscoverabilityConsentRepository = {
  findByUserId(userId: string): Promise<DiscoverabilityConsentState | null>;
  grant(userId: string): Promise<GrantedConsentRecord>;
  revoke(userId: string): Promise<RevokedConsentRecord>;
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

export function createPostgresDiscoverabilityConsentRepository(
  clock: Clock,
): DiscoverabilityConsentRepository {
  return {
    async findByUserId(userId) {
      const [row] = await getDb()
        .select({
          grantedAt: discoverabilityConsents.grantedAt,
          revokedAt: discoverabilityConsents.revokedAt,
        })
        .from(discoverabilityConsents)
        .where(eq(discoverabilityConsents.userId, userId))
        .limit(1);

      if (!row) {
        return null;
      }

      if (row.grantedAt !== null) {
        return { state: "granted", grantedAt: row.grantedAt };
      }

      if (row.revokedAt !== null) {
        return { state: "revoked", revokedAt: row.revokedAt };
      }

      return null;
    },
    async grant(userId) {
      const grantedAt = clock.now();
      const inserted = await getDb()
        .insert(discoverabilityConsents)
        .values({ userId, grantedAt, revokedAt: null })
        .onConflictDoUpdate({
          target: discoverabilityConsents.userId,
          set: { grantedAt, revokedAt: null },
        })
        .returning({
          userId: discoverabilityConsents.userId,
          grantedAt: discoverabilityConsents.grantedAt,
        });

      const [row] = inserted;
      if (!row || row.grantedAt === null) {
        throw new Error("discoverability_consent grant returned no row");
      }

      return { userId: row.userId, grantedAt: row.grantedAt };
    },
    async revoke(userId) {
      const revokedAt = clock.now();
      const upserted = await getDb()
        .insert(discoverabilityConsents)
        .values({ userId, grantedAt: null, revokedAt })
        .onConflictDoUpdate({
          target: discoverabilityConsents.userId,
          set: { grantedAt: null, revokedAt },
        })
        .returning({
          userId: discoverabilityConsents.userId,
          revokedAt: discoverabilityConsents.revokedAt,
        });

      const [row] = upserted;
      if (!row || row.revokedAt === null) {
        throw new Error("discoverability_consent revoke returned no row");
      }

      return { userId: row.userId, revokedAt: row.revokedAt };
    },
  };
}

let cachedDefaultRepository: DiscoverabilityConsentRepository | null = null;

function getRepository(): DiscoverabilityConsentRepository {
  return repositoryOverride ?? getDefaultDiscoverabilityConsentRepository();
}

function getDefaultDiscoverabilityConsentRepository(): DiscoverabilityConsentRepository {
  if (!cachedDefaultRepository) {
    cachedDefaultRepository =
      createPostgresDiscoverabilityConsentRepository(systemClock());
  }
  return cachedDefaultRepository;
}

export async function getDiscoverabilityConsent(
  userId: string,
): Promise<DiscoverabilityConsentRecord | null> {
  return getRepository().findByUserId(userId);
}

export async function grantDiscoverabilityConsent(
  userId: string,
): Promise<GrantedConsentRecord> {
  return getRepository().grant(userId);
}

export async function revokeDiscoverabilityConsent(
  userId: string,
): Promise<RevokedConsentRecord> {
  return getRepository().revoke(userId);
}

export function consentStateIsGranted(
  state: DiscoverabilityConsentState | null,
): state is DiscoverabilityConsentGrant {
  return state?.state === "granted";
}
