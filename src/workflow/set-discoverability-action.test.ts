import { describe, expect, it } from "vitest";

import {
  createSetDiscoverabilityActionHandler,
  type SetDiscoverabilityActionFieldErrors,
} from "../../app/(product)/me/_actions/set-discoverability";
import type { DiscoverabilityConsentRepository } from "../profile/discoverability-consent";
import type { Session } from "../auth/session";

function makeFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.append(key, value);
  }
  return formData;
}

const SESSION: Session = {
  user: {
    id: "user-1",
    email: "user@example.com",
    displayName: "Alice User",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token-1",
};

class InMemoryConsentRepository implements DiscoverabilityConsentRepository {
  private readonly state = new Map<
    string,
    | { state: "granted"; grantedAt: Date }
    | { state: "revoked"; revokedAt: Date }
  >();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findByUserId(
    userId: string,
  ): Promise<
    | { state: "granted"; grantedAt: Date }
    | { state: "revoked"; revokedAt: Date }
    | null
  > {
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

describe("setDiscoverabilityAction", () => {
  it("grants consent when the checkbox is ticked and redirects to /me/discoverability", async () => {
    const repository = new InMemoryConsentRepository();
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "true",
      confirmed: "on",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    expect(result).toEqual({ kind: "redirect", to: "/me/discoverability" });

    const stored = await repository.findByUserId("user-1");
    expect(stored?.state).toBe("granted");
  });

  it("revokes consent and redirects when granted is 'false'", async () => {
    const repository = new InMemoryConsentRepository();
    await repository.grant("user-1");
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "false",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    expect(result).toEqual({ kind: "redirect", to: "/me/discoverability" });

    const stored = await repository.findByUserId("user-1");
    expect(stored?.state).toBe("revoked");
  });

  it("returns consent_required when granted is true but confirmed is missing", async () => {
    const repository = new InMemoryConsentRepository();
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "true",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    expect(result).toMatchObject({
      kind: "form-error",
      code: "consent_required",
    });
    if (result.kind === "form-error") {
      const fieldErrors: SetDiscoverabilityActionFieldErrors =
        result.fieldErrors;
      expect(fieldErrors.confirmed).toBeTruthy();
    }
  });

  it("returns unauthenticated when there is no session", async () => {
    const repository = new InMemoryConsentRepository();
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(null),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "true",
      confirmed: "on",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    expect(result).toMatchObject({ kind: "redirect", to: "/sign-in" });
  });

  it("returns invalid_csrf when the CSRF token does not match the session", async () => {
    const repository = new InMemoryConsentRepository();
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "wrong-token",
      granted: "true",
      confirmed: "on",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
        },
      }),
    });

    expect(result).toMatchObject({ kind: "csrf-error" });
  });

  it("returns consent_already_granted when re-granting", async () => {
    const repository = new InMemoryConsentRepository();
    await repository.grant("user-1");
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "true",
      confirmed: "on",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    expect(result).toMatchObject({
      kind: "form-error",
      code: "consent_already_granted",
    });
  });

  it("returns consent_already_revoked when re-revoking", async () => {
    const repository = new InMemoryConsentRepository();
    await repository.grant("user-1");
    await repository.revoke("user-1");
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "false",
    });

    const result = await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    expect(result).toMatchObject({
      kind: "form-error",
      code: "consent_already_revoked",
    });
  });

  it("uses the session user id and never a user id from form data", async () => {
    const repository = new InMemoryConsentRepository();
    const handler = createSetDiscoverabilityActionHandler({
      repository,
      loadSession: async () => Promise.resolve(SESSION),
    });

    const formData = makeFormData({
      _csrf: "csrf-token-1",
      granted: "true",
      confirmed: "on",
      userId: "spoofed-user",
    });

    await handler({
      formData,
      request: new Request("http://localhost/me/discoverability", {
        method: "POST",
        headers: {
          cookie: "slotmerge_session=dummy",
          origin: "http://localhost",
          "x-csrf-token": "csrf-token-1",
        },
      }),
    });

    const stored = await repository.findByUserId("user-1");
    expect(stored?.state).toBe("granted");
    const spoofed = await repository.findByUserId("spoofed-user");
    expect(spoofed).toBeNull();
  });
});
