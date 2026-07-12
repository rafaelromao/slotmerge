import { afterEach, describe, expect, it } from "vitest";

import { POST, DELETE } from "../app/me/discoverability-consent/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import {
  clearDiscoverabilityConsentOverride,
  setDiscoverabilityConsentRepositoryForTests,
  type DiscoverabilityConsentRecord,
  type DiscoverabilityConsentRepository,
} from "../src/profile/discoverability-consent";

class InMemoryDiscoverabilityConsentRepository
  implements DiscoverabilityConsentRepository
{
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

async function authedSession(): Promise<string> {
  return sealSessionCookie({ sessionId: "session-1" });
}

function authedCsrfHeaders(cookie: string): Record<string, string> {
  return {
    cookie,
    "x-csrf-token": "csrf-token-1",
    "content-type": "application/json",
  };
}

async function authedPostRequest(
  body: unknown = { confirmed: true },
  options: { withCsrf?: boolean } = {},
): Promise<Request> {
  const cookie = await authedSession();
  const headers = authedCsrfHeaders(cookie);

  if (options.withCsrf === false) {
    return new Request("http://localhost/me/discoverability-consent", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  return new Request("http://localhost/me/discoverability-consent", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const sessionRecord = {
  user: {
    id: "user-1",
    email: "user@example.com",
    displayName: "Ada Lovelace",
    avatarUrl: null,
    shortBio: null,
    role: "user" as const,
    status: "active" as const,
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token-1",
};

describe("POST /me/discoverability-consent", () => {
  afterEach(() => {
    clearDiscoverabilityConsentOverride();
  });

  it("rejects requests without a session", async () => {
    const response = await POST(
      new Request("http://localhost/me/discoverability-consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("rejects requests with a valid session but mismatched CSRF token", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/discoverability-consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          "x-csrf-token": "wrong",
        },
        body: JSON.stringify({ confirmed: true }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_csrf" });
  });

  it("rejects a body that does not affirmatively confirm consent", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/discoverability-consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
        body: JSON.stringify({ confirmed: false }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_consent_request",
    });
  });

  it("rejects unexpected extra fields in the body", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/discoverability-consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
        body: JSON.stringify({ confirmed: true, foo: "bar" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_consent_request",
    });
  });

  it("records granted consent and replies with the granted timestamp", async () => {
    const repository =
      new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const request = await authedPostRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      discoverability: {
        consented: true,
        grantedAt: "2026-07-12T12:00:00.000Z",
      },
    });
  });
});

describe("DELETE /me/discoverability-consent", () => {
  afterEach(() => {
    clearDiscoverabilityConsentOverride();
  });

  it("rejects requests without a session", async () => {
    const response = await DELETE(
      new Request("http://localhost/me/discoverability-consent", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("rejects requests with mismatched CSRF token", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/discoverability-consent", {
        method: "DELETE",
        headers: {
          cookie,
          "x-csrf-token": "wrong",
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_csrf" });
  });

  it("treats revoke without a prior grant as an idempotent 200", async () => {
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/discoverability-consent", {
        method: "DELETE",
        headers: {
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      discoverability: { consented: false },
    });
  });

  it("removes a previously granted record on revoke", async () => {
    const repository =
      new InMemoryDiscoverabilityConsentRepository();
    await repository.grant("user-1");
    setDiscoverabilityConsentRepositoryForTests(repository);
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" ? sessionRecord : null,
        ),
    });

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/discoverability-consent", {
        method: "DELETE",
        headers: {
          cookie,
          "x-csrf-token": "csrf-token-1",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      discoverability: { consented: false },
    });
  });
});
