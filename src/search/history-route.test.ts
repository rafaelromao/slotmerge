import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../auth/session";
import { createSearchHistoryHandlers } from "./history-route";
import { InMemorySearchRepository } from "./in-memory-repository";
import { setSearchRepositoryForTests } from "./repository";
import {
  setSearchResultRepositoryForTests,
  type SearchResultRecord,
  type SearchResultRepository,
} from "./search-result-repository";

const baseSession: Session = {
  user: {
    id: "user-1",
    email: "test@example.com",
    displayName: null,
    avatarUrl: null,
    shortBio: null,
    role: "organizer",
    status: "active",
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token",
};

const adminSession: Session = {
  ...baseSession,
  user: { ...baseSession.user, role: "admin" },
};

const userSession: Session = {
  ...baseSession,
  user: { ...baseSession.user, role: "user" },
};

const baseSnapshotJson = {
  generatedAt: "2026-07-08T15:00:00.000Z",
  organizerTimezone: "UTC",
  dateRangeStart: "2026-07-06T00:00:00.000Z",
  dateRangeEnd: "2026-08-10T00:00:00.000Z",
  durationMinutes: 60,
  slots: [],
};

function createMockSearchResultRepository() {
  const bySearchId = new Map<string, SearchResultRecord>();
  const repo = {
    save: async (record: SearchResultRecord) => Promise.resolve(record),
    findById: async () => Promise.resolve(null),
    findBySearchId: async (searchId: string) => Promise.resolve(bySearchId.get(searchId) ?? null),
  };
  (repo as { _storage: Map<string, SearchResultRecord> })._storage = bySearchId;
  return repo;
}

describe("createSearchHistoryHandlers", () => {
  let mockResultRepo: SearchResultRepository & { _storage: Map<string, SearchResultRecord> };

  beforeEach(() => {
    mockResultRepo = createMockSearchResultRepository();
  });

  afterEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
  });

  describe("getHistory", () => {
    it("returns 403 for unauthenticated request", async () => {
      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(null),
      });

      const response = await handlers.getHistory(new Request("http://localhost/search/history"));
      expect(response.status).toBe(403);
    });

    it("returns 403 for user role", async () => {
      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(userSession),
      });

      const response = await handlers.getHistory(new Request("http://localhost/search/history"));
      expect(response.status).toBe(403);
    });

    it("returns 200 with history for organizer role", async () => {
      const repo = new InMemorySearchRepository();
      await repo.save({
        id: "search-1",
        organizerId: "user-1",
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: new Date(),
        dateRangeEnd: new Date(),
        organizerTimezone: "UTC",
        generatedAt: new Date(),
      });
      repo.setSnapshotId("search-1", "snapshot-1");

      setSearchRepositoryForTests(repo);

      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(baseSession),
      });

      const response = await handlers.getHistory(new Request("http://localhost/search/history"));
      expect(response.status).toBe(200);

      const body = await response.json() as { history: unknown[] };
      expect(body.history).toHaveLength(1);
      expect((body.history[0] as { id: string }).id).toBe("search-1");
    });

    it("returns 200 with history for admin role", async () => {
      const repo = new InMemorySearchRepository();
      await repo.save({
        id: "search-1",
        organizerId: "user-1",
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: new Date(),
        dateRangeEnd: new Date(),
        organizerTimezone: "UTC",
        generatedAt: new Date(),
      });
      repo.setSnapshotId("search-1", "snapshot-1");

      setSearchRepositoryForTests(repo);

      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(adminSession),
      });

      const response = await handlers.getHistory(new Request("http://localhost/search/history"));
      expect(response.status).toBe(200);

      const body = await response.json() as { history: unknown[] };
      expect(body.history).toHaveLength(1);
    });
  });

  describe("getSnapshot", () => {
    it("returns 403 for unauthenticated request", async () => {
      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(null),
      });

      const response = await handlers.getSnapshot(new Request("http://localhost/search/123/snapshot"), "123");
      expect(response.status).toBe(403);
    });

    it("returns 403 for user role", async () => {
      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(userSession),
      });

      const response = await handlers.getSnapshot(new Request("http://localhost/search/123/snapshot"), "123");
      expect(response.status).toBe(403);
    });

    it("returns 404 when snapshot not found", async () => {
      setSearchResultRepositoryForTests(mockResultRepo);

      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(baseSession),
      });

      const response = await handlers.getSnapshot(new Request("http://localhost/search/123/snapshot"), "123");
      expect(response.status).toBe(404);
    });

    it("returns snapshot for organizer role", async () => {
      const snapshotRecord: SearchResultRecord = {
        id: "snapshot-1",
        searchId: "search-1",
        snapshotJson: baseSnapshotJson,
        createdAt: new Date("2026-07-08T15:00:00.000Z"),
      };
      (mockResultRepo as unknown as { _storage: Map<string, SearchResultRecord> })._storage.set("search-1", snapshotRecord);
      setSearchResultRepositoryForTests(mockResultRepo);

      const handlers = createSearchHistoryHandlers({
        getSession: () => Promise.resolve(baseSession),
      });

      const response = await handlers.getSnapshot(new Request("http://localhost/search/search-1/snapshot"), "search-1");
      expect(response.status).toBe(200);

      const body = await response.json() as { id: string; searchId: string; snapshotJson: typeof baseSnapshotJson };
      expect(body.id).toBe("snapshot-1");
      expect(body.searchId).toBe("search-1");
      expect(body.snapshotJson).toEqual(baseSnapshotJson);
    });
  });
});
