import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDiscoverabilityWorkflow,
  type ProfileError,
} from "./discoverability";
import type { DiscoverabilityConsentRepository } from "../profile/discoverability-consent";

type StoredState =
  { state: "granted"; grantedAt: Date } | { state: "revoked"; revokedAt: Date };

class InMemoryConsentRepository implements DiscoverabilityConsentRepository {
  private readonly state = new Map<string, StoredState>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findByUserId(userId: string): Promise<StoredState | null> {
    await Promise.resolve();
    return this.state.get(userId) ?? null;
  }

  async grant(userId: string): Promise<{ userId: string; grantedAt: Date }> {
    await Promise.resolve();
    const grantedAt = this.now();
    this.state.set(userId, { state: "granted", grantedAt });
    return { userId, grantedAt };
  }

  async revoke(userId: string): Promise<{ userId: string; revokedAt: Date }> {
    await Promise.resolve();
    const revokedAt = this.now();
    this.state.set(userId, { state: "revoked", revokedAt });
    return { userId, revokedAt };
  }
}

const FIXED_NOW = new Date("2026-07-12T12:00:00.000Z");

describe("discoverabilityWorkflow.set", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants consent and returns ok({ discoverable: true }) when the user has not consented", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: true,
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ discoverable: true });
    }
  });

  it("returns consent_required when granted is requested without the consent checkbox confirmation", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("consent_required");
    }
  });

  it("allows revoke without requiring the consent confirmation", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    await repository.grant("user-1");
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ discoverable: false });
    }
  });

  it("soft-revokes and returns ok({ discoverable: false }) when granted is false on an existing record", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    await repository.grant("user-1");
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ discoverable: false });
    }

    const stored = await repository.findByUserId("user-1");
    expect(stored?.state).toBe("revoked");
  });

  it("returns consent_already_granted when re-granting an already granted user", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    await repository.grant("user-1");
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: true,
      confirmed: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error: ProfileError = result.error;
      expect(error.code).toBe("consent_already_granted");
    }
  });

  it("returns consent_already_revoked when re-revoking an already revoked user", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    await repository.grant("user-1");
    await repository.revoke("user-1");
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const error: ProfileError = result.error;
      expect(error.code).toBe("consent_already_revoked");
    }
  });

  it("treating revoke without a prior grant as a successful first revoke", async () => {
    const repository = new InMemoryConsentRepository(() => FIXED_NOW);
    const workflow = createDiscoverabilityWorkflow({ repository });

    const result = await workflow.set({
      userId: "user-1",
      granted: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ discoverable: false });
    }
  });
});
