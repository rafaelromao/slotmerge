import { afterEach, describe, expect, it } from "vitest";

import {
  clearDiscoverabilityConsentOverride,
  getDiscoverabilityConsent,
  revokeDiscoverabilityConsent,
  setDiscoverabilityConsentRepositoryForTests,
  type DiscoverabilityConsentRepository,
  type DiscoverabilityConsentRecord,
} from "./discoverability-consent";

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

describe("discoverability consent repository", () => {
  afterEach(() => {
    clearDiscoverabilityConsentOverride();
  });

  it("returns no consent record for a user who has never granted consent", async () => {
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );

    await expect(getDiscoverabilityConsent("user-1")).resolves.toBeNull();
  });

  it("persists a granted consent record with the grant timestamp", async () => {
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);

    await expect(repository.grant("user-1")).resolves.toMatchObject({
      userId: "user-1",
    });
    const record = await getDiscoverabilityConsent("user-1");

    expect(record).not.toBeNull();
    expect(record?.grantedAt).toBeInstanceOf(Date);
  });

  it("treats revoke on a missing record as an idempotent no-op", async () => {
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);

    await expect(
      revokeDiscoverabilityConsent("user-1"),
    ).resolves.toBeUndefined();
    await expect(getDiscoverabilityConsent("user-1")).resolves.toBeNull();
  });

  it("removes the consent record on revoke so it is no longer persisted", async () => {
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);

    await repository.grant("user-1");
    await revokeDiscoverabilityConsent("user-1");

    await expect(getDiscoverabilityConsent("user-1")).resolves.toBeNull();
  });

  it("re-granting consent after a revoke yields a fresh consent record", async () => {
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);

    await repository.grant("user-1");
    await revokeDiscoverabilityConsent("user-1");
    const reGranted = await repository.grant("user-1");

    await expect(getDiscoverabilityConsent("user-1")).resolves.toEqual(
      reGranted,
    );
  });

  it("supports swapping the repository via the test override without leaking across tests", async () => {
    const firstRepository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(firstRepository);

    await firstRepository.grant("user-1");
    await expect(getDiscoverabilityConsent("user-1")).resolves.toMatchObject({
      userId: "user-1",
    });

    clearDiscoverabilityConsentOverride();

    const secondRepository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(secondRepository);

    await expect(getDiscoverabilityConsent("user-1")).resolves.toBeNull();
  });
});
