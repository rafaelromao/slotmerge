import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GET,
  PATCH,
  DELETE,
  clearPerUserLookupStateForTests,
  setPerUserLookupStateForTests,
  listTopicsForUserInTests,
  listAvailabilityWindowsForUserInTests,
  listCalendarConnectionsForUserInTests,
} from "../app/me/route";
import { getProfileByUserId } from "../src/profile/repository";
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
import { setProfileRepositoryForTests } from "../src/profile/repository";
import { type TopicProposalStatus } from "../src/db/schema";

function setProfileStateForTests(profileState: ProfileStateBox) {
  setProfileRepositoryForTests({
    findByUserId: (userId) =>
      Promise.resolve(
        profileState.current && userId === profileState.current.id
          ? { ...profileState.current }
          : null,
      ),
    updateByUserId: (userId, patch) => {
      if (!profileState.current || userId !== profileState.current.id) {
        return Promise.resolve(null);
      }

      profileState.current = {
        ...profileState.current,
        ...patch,
      };

      return Promise.resolve({ ...profileState.current });
    },
    deleteByUserId: (userId) => {
      if (!profileState.current || userId !== profileState.current.id) {
        return Promise.resolve(false);
      }

      profileState.current = null as unknown as ProfileState;

      return Promise.resolve(true);
    },
  });
}

type ProfileStateBox = {
  current: ProfileState;
};

type ProfileState = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  shortBio: string | null;
  role: "user";
  status: "active";
  profileTimezone: string | null;
  bufferMinutes: number;
};

const setupItems = [
  { key: "displayName", label: "Display name", required: true, complete: true },
  {
    key: "discoverabilityConsent",
    label: "Discoverability consent",
    required: true,
    complete: false,
  },
  {
    key: "hasTopic",
    label: "At least one Topic or Topic Proposal",
    required: true,
    complete: false,
  },
  {
    key: "hasAvailability",
    label: "At least one Availability source or manual Availability Window",
    required: true,
    complete: false,
  },
  {
    key: "hasCalendarConnection",
    label: "Calendar Connection",
    required: false,
    complete: false,
  },
];

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

const userProfile = {
  id: "user-1",
  email: "user@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: "https://example.com/avatar.png",
  shortBio: "Computing pioneer",
  role: "user" as const,
  status: "active" as const,
  profileTimezone: "UTC",
  bufferMinutes: 15,
};

function authedSession(sessionId: string) {
  return sealSessionCookie({ sessionId });
}

function authedSessionRecord(csrfToken: string) {
  return {
    user: {
      id: userProfile.id,
      email: userProfile.email,
      displayName: userProfile.displayName,
      avatarUrl: null,
      shortBio: null,
      role: "user" as const,
      status: "active" as const,
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken,
  };
}

describe("GET /me discoverability consent reflection", () => {
  afterEach(() => {
    clearDiscoverabilityConsentOverride();
  });

  it("reports discoverability.grantedAt and complete checklist item when consent is on file", async () => {
    const repository = new InMemoryDiscoverabilityConsentRepository();
    await repository.grant(userProfile.id);
    setDiscoverabilityConsentRepositoryForTests(repository);

    setProfileStateForTests({
      current: { ...userProfile },
    });
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? authedSessionRecord("csrf-token-1")
            : null,
        ),
    });

    const cookie = await authedSession("session-1");
    const response = await GET(
      new Request("http://localhost/me", { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      discoverability: { consented: boolean; grantedAt: string | null };
      setup: { items: Array<{ key: string; complete: boolean }> };
    };
    expect(body.discoverability).toEqual({
      consented: true,
      grantedAt: "2026-07-12T12:00:00.000Z",
    });

    const consentItem = body.setup.items.find(
      (item) => item.key === "discoverabilityConsent",
    );
    expect(consentItem?.complete).toBe(true);
  });

  it("removes grantedAt and reverts the checklist item when consent has been revoked", async () => {
    const repository = new InMemoryDiscoverabilityConsentRepository();
    setDiscoverabilityConsentRepositoryForTests(repository);

    setProfileStateForTests({
      current: { ...userProfile },
    });
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? authedSessionRecord("csrf-token-1")
            : null,
        ),
    });

    const cookie = await authedSession("session-1");
    const response = await GET(
      new Request("http://localhost/me", { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      discoverability: { consented: boolean; grantedAt: string | null };
      setup: { items: Array<{ key: string; complete: boolean }> };
    };
    expect(body.discoverability).toEqual({
      consented: false,
      grantedAt: null,
    });

    const consentItem = body.setup.items.find(
      (item) => item.key === "discoverabilityConsent",
    );
    expect(consentItem?.complete).toBe(false);
  });
});

describe("GET /me", () => {
  beforeEach(() => {
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );
  });

  afterEach(() => {
    clearDiscoverabilityConsentOverride();
    clearPerUserLookupStateForTests();
  });
  it("rejects requests without a valid session", async () => {
    const response = await GET(new Request("http://localhost/me"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("returns the current profile state for an authenticated User", async () => {
    const profileState: ProfileStateBox = {
      current: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: "https://example.com/avatar.png",
        shortBio: "Computing pioneer",
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 15,
      },
    };

    setProfileStateForTests(profileState);
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await GET(
      new Request("http://localhost/me", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: "https://example.com/avatar.png",
        shortBio: "Computing pioneer",
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 15,
      },
      session: { csrfToken: "csrf-token-1" },
      setup: { complete: false, items: setupItems },
      discoverability: { consented: false, grantedAt: null },
      topics: [],
      topicProposals: [],
      availabilityWindows: [],
      calendarConnections: [],
      searchEligibility: { eligible: false },
    });
  });

  it("returns topicProposals with their status and marks hasTopic complete for pending proposals", async () => {
    const profileState: ProfileStateBox = {
      current: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 15,
      },
    };

    setProfileStateForTests(profileState);
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const topicProposals = new Map<
      string,
      Array<{ id: string; name: string; status: TopicProposalStatus }>
    >();
    topicProposals.set("user-1", [
      { id: "proposal-1", name: "Compilers", status: "pending" },
      { id: "proposal-2", name: "Type Theory", status: "approved" },
      { id: "proposal-3", name: "Parsing", status: "rejected" },
    ]);
    setPerUserLookupStateForTests({
      topicProposalsByUserId: topicProposals,
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await GET(
      new Request("http://localhost/me", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      topicProposals: Array<{ id: string; name: string; status: string }>;
      setup: { items: Array<{ key: string; complete: boolean }> };
    };
    expect(body.topicProposals).toContainEqual({
      id: "proposal-1",
      name: "Compilers",
      status: "pending",
    });
    expect(body.topicProposals).toContainEqual({
      id: "proposal-2",
      name: "Type Theory",
      status: "approved",
    });
    expect(body.topicProposals).toContainEqual({
      id: "proposal-3",
      name: "Parsing",
      status: "rejected",
    });

    const hasTopicItem = body.setup.items.find(
      (item) => item.key === "hasTopic",
    );
    expect(hasTopicItem?.complete).toBe(true);
  });
});

describe("PATCH /me", () => {
  beforeEach(() => {
    setDiscoverabilityConsentRepositoryForTests(
      new InMemoryDiscoverabilityConsentRepository(),
    );
  });

  afterEach(() => {
    clearDiscoverabilityConsentOverride();
    clearPerUserLookupStateForTests();
  });
  it("rejects invalid profile updates without mutating the stored profile", async () => {
    const profileState: ProfileState = {
      id: "user-1",
      email: "user@example.com",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      shortBio: null,
      role: "user",
      status: "active",
      profileTimezone: "UTC",
      bufferMinutes: 15,
    };

    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve(
          userId === profileState.id ? { ...profileState } : null,
        ),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: "UTC",
                  bufferMinutes: 15,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await PATCH(
      new Request("http://localhost/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "csrf-token-1",
          cookie,
        },
        body: JSON.stringify({ bufferMinutes: -1 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_profile_update",
    });
  });

  it("rejects requests without a matching CSRF token", async () => {
    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve(
          userId === "user-1"
            ? {
                id: "user-1",
                email: "user@example.com",
                displayName: "Ada Lovelace",
                avatarUrl: null,
                shortBio: null,
                role: "user",
                status: "active",
                profileTimezone: "UTC",
                bufferMinutes: 15,
              }
            : null,
        ),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: "UTC",
                  bufferMinutes: 15,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await PATCH(
      new Request("http://localhost/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ displayName: "Grace Hopper" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_csrf",
    });
  });

  it("updates the profile and persists the edits across sessions", async () => {
    const profileState: ProfileStateBox = {
      current: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 15,
      },
    };

    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve(
          profileState.current && userId === profileState.current.id
            ? { ...profileState.current }
            : null,
        ),
      updateByUserId: (userId, patch) => {
        if (!profileState.current || userId !== profileState.current.id) {
          return Promise.resolve(null);
        }

        profileState.current = { ...profileState.current, ...patch };

        return Promise.resolve({ ...profileState.current });
      },
      deleteByUserId: (userId) => {
        if (!profileState.current || userId !== profileState.current.id) {
          return Promise.resolve(false);
        }

        profileState.current = null as unknown as ProfileState;

        return Promise.resolve(true);
      },
    });
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" || sessionId === "session-2"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: "UTC",
                  bufferMinutes: 15,
                },
                csrfToken:
                  sessionId === "session-1" ? "csrf-token-1" : "csrf-token-2",
              }
            : null,
        ),
    });

    const firstCookie = await sealSessionCookie({ sessionId: "session-1" });
    const patchResponse = await PATCH(
      new Request("http://localhost/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "csrf-token-1",
          cookie: firstCookie,
        },
        body: JSON.stringify({
          avatarUrl: "https://example.com/grace.png",
          shortBio: "Compiler pioneer",
          profileTimezone: "America/New_York",
          bufferMinutes: 30,
        }),
      }),
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: "https://example.com/grace.png",
        shortBio: "Compiler pioneer",
        role: "user",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 30,
      },
      session: { csrfToken: "csrf-token-1" },
      setup: { complete: false, items: setupItems },
      discoverability: { consented: false, grantedAt: null },
      topics: [],
      topicProposals: [],
      availabilityWindows: [],
      calendarConnections: [],
      searchEligibility: { eligible: false },
    });

    const secondCookie = await sealSessionCookie({ sessionId: "session-2" });
    const getResponse = await GET(
      new Request("http://localhost/me", {
        headers: { cookie: secondCookie },
      }),
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: "https://example.com/grace.png",
        shortBio: "Compiler pioneer",
        role: "user",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 30,
      },
      session: { csrfToken: "csrf-token-2" },
      setup: { complete: false, items: setupItems },
      discoverability: { consented: false, grantedAt: null },
      topics: [],
      topicProposals: [],
      availabilityWindows: [],
      calendarConnections: [],
      searchEligibility: { eligible: false },
    });
  });

  it("updates the display name and keeps it on later reads", async () => {
    const profileState: ProfileStateBox = {
      current: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 15,
      },
    };

    setProfileStateForTests(profileState);
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1" || sessionId === "session-2"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: "UTC",
                  bufferMinutes: 15,
                },
                csrfToken:
                  sessionId === "session-1" ? "csrf-token-1" : "csrf-token-2",
              }
            : null,
        ),
    });

    const firstCookie = await sealSessionCookie({ sessionId: "session-1" });
    const patchResponse = await PATCH(
      new Request("http://localhost/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "csrf-token-1",
          cookie: firstCookie,
        },
        body: JSON.stringify({ displayName: "Grace Hopper" }),
      }),
    );

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      user: {
        displayName: "Grace Hopper",
      },
    });

    const secondCookie = await sealSessionCookie({ sessionId: "session-2" });
    const getResponse = await GET(
      new Request("http://localhost/me", {
        headers: { cookie: secondCookie },
      }),
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      user: {
        displayName: "Grace Hopper",
      },
    });
  });
});

describe("DELETE /me", () => {
  it("rejects requests without a valid session", async () => {
    const response = await DELETE(new Request("http://localhost/me"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("rejects requests without a matching CSRF token", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await DELETE(
      new Request("http://localhost/me", {
        method: "DELETE",
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_csrf",
    });
  });

  it("removes the authenticated User, clears the session cookie, and empties per-user lookups", async () => {
    const profileState: ProfileStateBox = {
      current: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 15,
      },
    };

    setProfileStateForTests(profileState);
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: "UTC",
                  bufferMinutes: 15,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const topics = new Map<string, Array<{ id: string; name: string }>>();
    topics.set("user-1", [{ id: "topic-1", name: "Compilers" }]);
    const availability = new Map<
      string,
      Array<{ id: string; dayOfWeek: number }>
    >();
    availability.set("user-1", [{ id: "win-1", dayOfWeek: 1 }]);
    const calendar = new Map<string, Array<{ id: string; provider: string }>>();
    calendar.set("user-1", [{ id: "cal-1", provider: "google" }]);

    setPerUserLookupStateForTests({
      topicsByUserId: topics,
      availabilityWindowsByUserId: availability,
      calendarConnectionsByUserId: calendar,
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await DELETE(
      new Request("http://localhost/me", {
        method: "DELETE",
        headers: {
          "x-csrf-token": "csrf-token-1",
          cookie,
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("slotmerge_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");

    await expect(getProfileByUserId("user-1")).resolves.toBeNull();
    await expect(listTopicsForUserInTests("user-1")).resolves.toEqual([]);
    await expect(
      listAvailabilityWindowsForUserInTests("user-1"),
    ).resolves.toEqual([]);
    await expect(
      listCalendarConnectionsForUserInTests("user-1"),
    ).resolves.toEqual([]);

    clearPerUserLookupStateForTests();
  });

  it("responds with 404 user_not_found when the repository reports the user is already gone", async () => {
    setProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: "Ada Lovelace",
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: "UTC",
                  bufferMinutes: 15,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await DELETE(
      new Request("http://localhost/me", {
        method: "DELETE",
        headers: {
          "x-csrf-token": "csrf-token-1",
          cookie,
        },
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "user_not_found",
    });
  });
});
