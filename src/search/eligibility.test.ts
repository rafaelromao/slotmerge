import { afterEach, describe, expect, it } from "vitest";

import {
  clearDiscoverabilityConsentOverride,
  setDiscoverabilityConsentRepositoryForTests,
  type DiscoverabilityConsentRecord,
  type DiscoverabilityConsentRepository,
} from "../profile/discoverability-consent";
import {
  type ProfileInputs,
  isEligibleForSearch,
  isUserEligibleForSearch,
  setSearchEligibilityProfileInputsForTests,
} from "./eligibility";

class InMemoryDiscoverabilityConsentRepository implements DiscoverabilityConsentRepository {
  private readonly state = new Map<string, DiscoverabilityConsentRecord>();

  async findByUserId(
    userId: string,
  ): Promise<DiscoverabilityConsentRecord | null> {
    await Promise.resolve();
    return this.state.get(userId) ?? null;
  }

  async grant(userId: string): Promise<DiscoverabilityConsentRecord> {
    await Promise.resolve();
    const existing = this.state.get(userId);
    if (existing) {
      return existing;
    }
    const record: DiscoverabilityConsentRecord = {
      userId,
      grantedAt: new Date("2026-07-12T12:00:00.000Z"),
    };
    this.state.set(userId, record);
    return record;
  }

  async revoke(userId: string): Promise<void> {
    await Promise.resolve();
    this.state.delete(userId);
  }
}

const setupCompleteProfile: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
};

const suspendedProfile: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: false,
};

describe("isUserEligibleForSearch", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
    clearDiscoverabilityConsentOverride();
  });

  it("is false when the user has never granted consent", async () => {
    setSearchEligibilityProfileInputsForTests({
      "user-1": setupCompleteProfile,
    });
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(false);
  });

  it("is false when consent is granted but profile inputs are missing", () => {
    expect(isEligibleForSearch(null, true)).toBe(false);
    expect(isEligibleForSearch(undefined, true)).toBe(false);
  });

  it("is false when consent is missing even with complete profile inputs", () => {
    expect(isEligibleForSearch(setupCompleteProfile, false)).toBe(false);
  });

  it("is true when both consent and profile inputs are complete", () => {
    expect(isEligibleForSearch(setupCompleteProfile, true)).toBe(true);
  });

  it("flips from false to true the moment consent is granted", async () => {
    setSearchEligibilityProfileInputsForTests({
      "user-1": setupCompleteProfile,
    });
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(false);

    await repository.grant("user-1");

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(true);
  });

  it("flips from true to false immediately when consent is revoked", async () => {
    setSearchEligibilityProfileInputsForTests({
      "user-1": setupCompleteProfile,
    });
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);
    await repository.grant("user-1");

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(true);

    await repository.revoke("user-1");

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(false);
  });

  it("stays false when the rest of setup is incomplete even with consent granted", async () => {
    setSearchEligibilityProfileInputsForTests({
      "user-1": {
        hasDisplayName: true,
        hasTopicOrProposal: false,
        hasAvailabilitySource: true,
      },
    });
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);
    await repository.grant("user-1");

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(false);
  });

  it("returns false for a suspended user even with consent granted", async () => {
    setSearchEligibilityProfileInputsForTests({
      "user-1": suspendedProfile,
    });
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);
    await repository.grant("user-1");

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(false);
  });

  it("returns false for an unknown profile row", async () => {
    setSearchEligibilityProfileInputsForTests({});
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );

    await expect(isUserEligibleForSearch("user-1")).resolves.toBe(false);
  });
});
