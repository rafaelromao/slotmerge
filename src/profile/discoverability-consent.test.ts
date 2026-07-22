import { afterEach, describe, expect, it } from "vitest";

import {
  clearDiscoverabilityConsentOverride,
  type DiscoverabilityConsentRecord,
  type DiscoverabilityConsentRepository,
  type DiscoverabilityConsentState,
  getDiscoverabilityConsent,
  grantDiscoverabilityConsent,
  revokeDiscoverabilityConsent,
  setDiscoverabilityConsentRepositoryForTests,
} from "./discoverability-consent";

class InMemoryDiscoverabilityConsentRepository implements DiscoverabilityConsentRepository {
  private readonly state = new Map<string, DiscoverabilityConsentState>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findByUserId(
    userId: string,
  ): Promise<DiscoverabilityConsentState | null> {
    await Promise.resolve();
    const stored = this.state.get(userId);
    if (!stored) {
      return null;
    }
    if (stored.state === "granted") {
      return { state: "granted", grantedAt: stored.grantedAt };
    }
    return { state: "revoked", revokedAt: stored.revokedAt };
  }

  async grant(userId: string): Promise<{ userId: string; grantedAt: Date }> {
    await Promise.resolve();
    const grantedAt = this.now();
    const record = { state: "granted" as const, grantedAt };
    this.state.set(userId, record);
    return { userId, grantedAt };
  }

  async revoke(userId: string): Promise<{ userId: string; revokedAt: Date }> {
    await Promise.resolve();
    const revokedAt = this.now();
    const record = { state: "revoked" as const, revokedAt };
    this.state.set(userId, record);
    return { userId, revokedAt };
  }

  hasStoredRecord(userId: string): boolean {
    return this.state.has(userId);
  }
}

describe("discoverability consent repository (soft-revoke)", () => {
  afterEach(() => {
    clearDiscoverabilityConsentOverride();
  });

  it("returns null when the user has never granted consent", async () => {
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );

    await expect(getDiscoverabilityConsent("user-1")).resolves.toBeNull();
  });

  it("returns the granted state with the grant timestamp after grant()", async () => {
    const fixedNow = new Date("2026-07-12T12:00:00.000Z");
    const repository = new InMemoryDiscoverabilityConsentRepository(
      () => fixedNow,
    );
    setDiscoverabilityConsentRepositoryForTests(repository);

    await grantDiscoverabilityConsent("user-1");

    await expect(getDiscoverabilityConsent("user-1")).resolves.toEqual({
      state: "granted",
      grantedAt: fixedNow,
    });
  });

  it("soft-revokes the consent record so the row is preserved with revokedAt", async () => {
    let now = new Date("2026-07-12T12:00:00.000Z");
    const repository = new InMemoryDiscoverabilityConsentRepository(() => now);
    setDiscoverabilityConsentRepositoryForTests(repository);

    await grantDiscoverabilityConsent("user-1");
    const revokeAt = new Date("2026-07-13T08:00:00.000Z");
    now = revokeAt;
    await revokeDiscoverabilityConsent("user-1");

    expect(repository.hasStoredRecord("user-1")).toBe(true);
    await expect(getDiscoverabilityConsent("user-1")).resolves.toEqual({
      state: "revoked",
      revokedAt: revokeAt,
    });
  });

  it("treats revoke on a missing record as a fresh revoked record", async () => {
    const revokeAt = new Date("2026-07-13T08:00:00.000Z");
    const repository = new InMemoryDiscoverabilityConsentRepository(
      () => revokeAt,
    );
    setDiscoverabilityConsentRepositoryForTests(repository);

    await revokeDiscoverabilityConsent("user-1");

    await expect(getDiscoverabilityConsent("user-1")).resolves.toEqual({
      state: "revoked",
      revokedAt: revokeAt,
    });
  });

  it("re-granting after a revoke clears the revoked timestamp and stores grantedAt", async () => {
    let now = new Date("2026-07-12T12:00:00.000Z");
    const repository = new InMemoryDiscoverabilityConsentRepository(() => now);
    setDiscoverabilityConsentRepositoryForTests(repository);

    await grantDiscoverabilityConsent("user-1");
    now = new Date("2026-07-13T08:00:00.000Z");
    await revokeDiscoverabilityConsent("user-1");
    const reGrantAt = new Date("2026-07-14T09:30:00.000Z");
    now = reGrantAt;
    await grantDiscoverabilityConsent("user-1");

    await expect(getDiscoverabilityConsent("user-1")).resolves.toEqual({
      state: "granted",
      grantedAt: reGrantAt,
    });
  });

  it("supports swapping the repository via the test override without leaking across tests", async () => {
    const grantAt = new Date("2026-07-12T12:00:00.000Z");
    const firstRepository = new InMemoryDiscoverabilityConsentRepository(
      () => grantAt,
    );
    setDiscoverabilityConsentRepositoryForTests(firstRepository);

    await grantDiscoverabilityConsent("user-1");
    await expect(getDiscoverabilityConsent("user-1")).resolves.toMatchObject({
      state: "granted",
    });

    clearDiscoverabilityConsentOverride();

    const secondRepository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(secondRepository);

    await expect(getDiscoverabilityConsent("user-1")).resolves.toBeNull();
  });

  it("type-narrows the returned record so callers can switch on state", async () => {
    const fixedNow = new Date("2026-07-12T12:00:00.000Z");
    const repository = new InMemoryDiscoverabilityConsentRepository(
      () => fixedNow,
    );
    setDiscoverabilityConsentRepositoryForTests(repository);

    await grantDiscoverabilityConsent("user-1");
    const grantedRecord: DiscoverabilityConsentRecord | null =
      await getDiscoverabilityConsent("user-1");
    expect(grantedRecord).not.toBeNull();
    expect(grantedRecord?.state).toBe("granted");

    await revokeDiscoverabilityConsent("user-1");
    const revokedRecord: DiscoverabilityConsentRecord | null =
      await getDiscoverabilityConsent("user-1");
    expect(revokedRecord?.state).toBe("revoked");
  });
});
