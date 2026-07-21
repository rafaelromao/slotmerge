import { afterEach, describe, expect, it } from "vitest";

import { GET } from "../app/api/v1/searches/[id]/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
  type Session,
  type SessionRepository,
} from "../src/auth/session";
import {
  setSearchRepositoryForTests,
  type SearchRepository,
} from "../src/search/repository";
import {
  setSearchResultRepositoryForTests,
  type SearchResultRepository,
} from "../src/search/search-result-repository";

const SESSION_ID = "test-session-id";

const mockSessionRepository: SessionRepository = {
  async findById(sessionId: string): Promise<Session | null> {
    await Promise.resolve();
    if (sessionId !== SESSION_ID) {
      return null;
    }
    return {
      user: {
        id: "user-1",
        email: "organizer@example.com",
        displayName: "Organizer",
        avatarUrl: null,
        shortBio: null,
        role: "organizer",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
      csrfToken: "test-csrf-token",
    };
  },
};

const mockSearchRepository: SearchRepository = {
  async save(): Promise<import("../src/search/repository").SearchRecord> {
    await Promise.resolve();
    throw new Error("Not implemented");
  },
  async findById(): Promise<import("../src/search/repository").SearchRecord | null> {
    await Promise.resolve();
    return null;
  },
  async listByOrganizer(): Promise<import("../src/search/repository").SearchRecord[]> {
    await Promise.resolve();
    throw new Error("Not implemented");
  },
  async listSearchHistory(): Promise<import("../src/search/repository").SearchHistoryItem[]> {
    await Promise.resolve();
    throw new Error("Not implemented");
  },
  async listAll(): Promise<import("../src/search/repository").SearchRecord[]> {
    await Promise.resolve();
    throw new Error("Not implemented");
  },
};

const mockSearchResultRepository: SearchResultRepository = {
  async save(): Promise<import("../src/search/search-result-repository").SearchResultRecord> {
    await Promise.resolve();
    throw new Error("Not implemented");
  },
  async findById(): Promise<import("../src/search/search-result-repository").SearchResultRecord | null> {
    await Promise.resolve();
    throw new Error("Not implemented");
  },
  async findBySearchId(): Promise<import("../src/search/search-result-repository").SearchResultRecord | null> {
    await Promise.resolve();
    return null;
  },
};

describe("GET /api/v1/searches/{id}", () => {
  afterEach(() => {
    setSessionRepositoryForTests(null);
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
  });

  it("returns 401 when no session cookie is provided", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/searches/test-id"),
      { params: Promise.resolve({ id: "test-id" }) },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
  });

  it("returns 404 when the search does not exist", async () => {
    setSessionRepositoryForTests(mockSessionRepository);
    setSearchRepositoryForTests(mockSearchRepository);
    setSearchResultRepositoryForTests(mockSearchResultRepository);

    const cookie = await sealSessionCookie({ sessionId: SESSION_ID });

    const response = await GET(
      new Request("http://localhost/api/v1/searches/nonexistent", {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});
