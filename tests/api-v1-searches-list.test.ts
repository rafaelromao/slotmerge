import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "../app/api/v1/searches/route";
import {
  setSessionRepositoryForTests,
  type Session,
} from "../src/auth/session";
import {
  setSearchRepositoryForTests,
  type SearchRepository,
} from "../src/search/repository";
import {
  setSearchResultRepositoryForTests,
  type SearchResultRepository,
} from "../src/search/search-result-repository";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";
import { setProfileRepositoryForTests } from "../src/profile/repository";
import { setDiscoverableUserRepositoryForTests } from "../src/search/discoverable-user-repository";

const ORG_SESSION_ID = "org-session";
const ADMIN_SESSION_ID = "admin-session";
const USER_SESSION_ID = "user-session";

const sessionFor = (role: "organizer" | "admin" | "user"): Session => ({
  user: {
    id: `user-${role}`,
    email: `${role}@example.com`,
    displayName: role,
    avatarUrl: null,
    shortBio: null,
    role,
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
  },
  csrfToken: `csrf-${role}`,
});

const mockSessionRepository = {
  async findById(sessionId: string): Promise<Session | null> {
    await Promise.resolve();
    if (sessionId === ORG_SESSION_ID) return sessionFor("organizer");
    if (sessionId === ADMIN_SESSION_ID) return sessionFor("admin");
    if (sessionId === USER_SESSION_ID) return sessionFor("user");
    return null;
  },
};

const mockSearchRepository: SearchRepository = {
  async save() {
    await Promise.resolve();
    throw new Error("not used");
  },
  async findById() {
    await Promise.resolve();
    return null;
  },
  async listByOrganizer() {
    await Promise.resolve();
    return [];
  },
  async listSearchHistory() {
    await Promise.resolve();
    return [
      {
        id: "search-1",
        organizerId: "user-organizer",
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
        dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
        organizerTimezone: "America/Sao_Paulo",
        generatedAt: new Date("2026-07-08T15:00:00.000Z"),
        snapshotId: "snapshot-1",
        stale: false,
      },
    ];
  },
  async listAll() {
    await Promise.resolve();
    return [];
  },
};

const mockSearchResultRepository: SearchResultRepository = {
  async save() {
    await Promise.resolve();
    throw new Error("not used");
  },
  async findById() {
    await Promise.resolve();
    return null;
  },
  async findBySearchId() {
    await Promise.resolve();
    return null;
  },
};

async function sealSession(sessionId: string): Promise<string> {
  const { sealSessionCookie } = await import("../src/auth/session");
  return sealSessionCookie({ sessionId });
}

describe("GET /api/v1/searches", () => {
  beforeEach(() => {
    setSessionRepositoryForTests(mockSessionRepository);
    setSearchRepositoryForTests(mockSearchRepository);
    setSearchResultRepositoryForTests(mockSearchResultRepository);
    setTopicCatalogueRepositoryForTests({
      async listCatalogue() {
        await Promise.resolve();
        return [
          {
            id: "topic-1",
            name: "Product strategy",
            status: "active" as const,
          },
        ];
      },
      async listSelectedTopicIds() {
        await Promise.resolve();
        return [];
      },
      async listAssociations() {
        await Promise.resolve();
        return [];
      },
      async saveAssociations() {
        await Promise.resolve();
      },
    });
    setProfileRepositoryForTests({
      async findByUserId(userId) {
        await Promise.resolve();
        return {
          id: userId,
          email: `${userId}@example.com`,
          displayName: userId === "user-organizer" ? "Ada Organizer" : userId,
          avatarUrl: null,
          shortBio: null,
          role: "organizer",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
        };
      },
      async updateByUserId() {
        await Promise.resolve();
        return null;
      },
      async deleteByUserId() {
        await Promise.resolve();
        return false;
      },
    });
    setDiscoverableUserRepositoryForTests({
      async listDiscoverableUserIds() {
        await Promise.resolve();
        return [];
      },
    });
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
    setProfileRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
  });

  it("returns 401 problem+json with no session cookie", async () => {
    const response = await GET(new Request("http://localhost/api/v1/searches"));
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Sign in required");
    expect(body.status).toBe(401);
  });

  it("returns 403 problem+json for non-organizer/admin roles", async () => {
    const cookie = await sealSession(USER_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches", { headers: { cookie } }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.title).toBe("Organizer access required");
    expect(body.status).toBe(403);
  });

  it("returns 200 with the serialized history for organizer", async () => {
    const cookie = await sealSession(ORG_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches", { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.history).toEqual([
      {
        id: "search-1",
        organizerId: "user-organizer",
        organizerDisplayName: "Ada Organizer",
        selectedTopicIds: ["topic-1"],
        selectedTopicNames: ["Product strategy"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: "2026-07-06T03:00:00.000Z",
        dateRangeEnd: "2026-08-10T03:00:00.000Z",
        organizerTimezone: "America/Sao_Paulo",
        generatedAt: "2026-07-08T15:00:00.000Z",
        snapshotId: "snapshot-1",
        stale: false,
      },
    ]);
  });

  it("returns 200 with the serialized history for admin", async () => {
    const cookie = await sealSession(ADMIN_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches", { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { history: unknown[] };
    expect(body.history).toHaveLength(1);
  });
});