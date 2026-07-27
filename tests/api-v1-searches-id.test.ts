import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GET,
  setSearchWorkflowForTests,
} from "../app/api/v1/searches/[id]/route";
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
import { createSearchWorkflow } from "../src/workflow/search";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";
import { setProfileRepositoryForTests } from "../src/profile/repository";
import { setDiscoverableUserRepositoryForTests } from "../src/search/discoverable-user-repository";
import { pinnedClock } from "./helpers/workflow-search-fixtures";

const ORG_SESSION_ID = "org-session";
const USER_SESSION_ID = "user-session";

const sessionFor = (role: "organizer" | "user"): Session => ({
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
    if (sessionId === USER_SESSION_ID) return sessionFor("user");
    return null;
  },
};

async function sealSession(sessionId: string): Promise<string> {
  const { sealSessionCookie } = await import("../src/auth/session");
  return sealSessionCookie({ sessionId });
}

function makeSearchRepository(
  present: boolean,
): SearchRepository {
  return {
    async save() {
      await Promise.resolve();
      throw new Error("not used");
    },
    async findById() {
      await Promise.resolve();
      if (!present) return null;
      return {
        id: "search-1",
        organizerId: "user-organizer",
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
        dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
        organizerTimezone: "UTC",
        generatedAt: new Date("2026-07-08T15:00:00.000Z"),
      };
    },
    async listByOrganizer() {
      await Promise.resolve();
      return [];
    },
    async listSearchHistory() {
      await Promise.resolve();
      return [];
    },
    async listAll() {
      await Promise.resolve();
      return [];
    },
  };
}

function makeSearchResultRepository(
  hasSnapshot: boolean,
): SearchResultRepository {
  return {
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
      if (!hasSnapshot) return null;
      return {
        id: "snapshot-1",
        searchId: "search-1",
        snapshotJson: {
          generatedAt: "2026-07-08T15:00:00.000Z",
          organizerTimezone: "UTC",
          dateRangeStart: "2026-07-06T00:00:00.000Z",
          dateRangeEnd: "2026-08-10T00:00:00.000Z",
          durationMinutes: 60,
          slots: [],
        },
        createdAt: new Date("2026-07-08T15:00:00.000Z"),
      };
    },
  };
}

describe("GET /api/v1/searches/{id}", () => {
  beforeEach(() => {
    setSessionRepositoryForTests(mockSessionRepository);
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
    setProfileRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setSearchWorkflowForTests(null);
  });

  it("returns 401 problem+json when no session cookie is provided", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/searches/test-id"),
      { params: Promise.resolve({ id: "test-id" }) },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.title).toBe("Sign in required");
    expect(body.status).toBe(401);
  });

  it("returns 403 problem+json for non-organizer/admin roles", async () => {
    const cookie = await sealSession(USER_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches/test-id", {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "test-id" }) },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.title).toBe("Organizer access required");
  });

  it("returns 404 problem+json when the search is not found", async () => {
    setSearchRepositoryForTests(makeSearchRepository(false));
    setSearchResultRepositoryForTests(makeSearchResultRepository(false));
    setTopicCatalogueRepositoryForTests({
      async listCatalogue() {
        await Promise.resolve();
        return [];
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
      async findByUserId() {
        await Promise.resolve();
        return null;
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

    const cookie = await sealSession(ORG_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches/missing", {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.title).toBe("Search not found");
  });

  it("returns 404 problem+json when the snapshot is missing", async () => {
    setSearchRepositoryForTests(makeSearchRepository(true));
    setSearchResultRepositoryForTests(makeSearchResultRepository(false));
    setTopicCatalogueRepositoryForTests({
      async listCatalogue() {
        await Promise.resolve();
        return [];
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
      async findByUserId() {
        await Promise.resolve();
        return null;
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

    const cookie = await sealSession(ORG_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches/search-1", {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "search-1" }) },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.title).toBe("Snapshot not found");
  });

  it("returns 200 with the serialized snapshot for organizer", async () => {
    setSearchRepositoryForTests(makeSearchRepository(true));
    setSearchResultRepositoryForTests(makeSearchResultRepository(true));
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
      async findByUserId() {
        await Promise.resolve();
        return null;
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

    const workflow = createSearchWorkflow({
      clock: pinnedClock("2026-07-08T15:00:00.000Z"),
      profileRepository: {
        async findByUserId() {
          await Promise.resolve();
          return null;
        },
      },
      activeTopicsRepository: {
        async listActive() {
          await Promise.resolve();
          return [
            { id: "topic-1", name: "Product strategy", status: "active" as const },
          ];
        },
      },
      discoverableUserRepository: {
        async listDiscoverableUserIds() {
          await Promise.resolve();
          return [];
        },
      },
      searchResultRepository: makeSearchResultRepository(true),
    });
    setSearchWorkflowForTests(workflow);

    const cookie = await sealSession(ORG_SESSION_ID);
    const response = await GET(
      new Request("http://localhost/api/v1/searches/search-1", {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "search-1" }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.search).toMatchObject({
      id: "search-1",
      organizerId: "user-organizer",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      organizerTimezone: "UTC",
    });
    expect(body.snapshot).toMatchObject({
      generatedAt: "2026-07-08T15:00:00.000Z",
      organizerTimezone: "UTC",
      durationMinutes: 60,
    });
    expect(body.selectedTopics).toEqual([
      { id: "topic-1", name: "Product strategy" },
    ]);
  });
});