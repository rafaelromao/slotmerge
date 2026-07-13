import { afterEach, describe, expect, it } from "vitest";

import {
  type SearchResultRecord,
  type SearchResultRepository,
  setSearchResultRepositoryForTests,
} from "./search-result-repository";

class InMemorySearchResultRepository implements SearchResultRepository {
  private readonly byId = new Map<string, SearchResultRecord>();
  private readonly bySearchId = new Map<string, SearchResultRecord>();

  async save(record: SearchResultRecord): Promise<SearchResultRecord> {
    await Promise.resolve();
    const id: string = record.id ?? crypto.randomUUID();
    const stored: SearchResultRecord = {
      ...record,
      id,
    };
    this.byId.set(id, stored);
    this.bySearchId.set(stored.searchId, stored);
    return stored;
  }

  async findById(id: string): Promise<SearchResultRecord | null> {
    await Promise.resolve();
    return this.byId.get(id) ?? null;
  }

  async findBySearchId(searchId: string): Promise<SearchResultRecord | null> {
    await Promise.resolve();
    return this.bySearchId.get(searchId) ?? null;
  }
}

describe("SearchResultRepository", () => {
  afterEach(() => {
    setSearchResultRepositoryForTests(null);
  });

  describe("save and findById", () => {
    it("persists a SearchResult record and retrieves it by id", async () => {
      const repo = new InMemorySearchResultRepository();
      setSearchResultRepositoryForTests(repo);

      const record: SearchResultRecord = {
        id: undefined,
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

      const saved = await repo.save(record);

      expect(saved.id).toBeTypeOf("string");
      expect(saved.searchId).toBe("search-1");
      expect(saved.snapshotJson).toEqual(record.snapshotJson);

      const found = await repo.findById(saved.id!);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
      expect(found!.searchId).toBe("search-1");
    });

    it("returns null when finding a non-existent id", async () => {
      const repo = new InMemorySearchResultRepository();
      setSearchResultRepositoryForTests(repo);

      const found = await repo.findById("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("findBySearchId", () => {
    it("retrieves a SearchResult by its searchId", async () => {
      const repo = new InMemorySearchResultRepository();
      setSearchResultRepositoryForTests(repo);

      const record: SearchResultRecord = {
        id: undefined,
        searchId: "search-2",
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

      const saved = await repo.save(record);
      const found = await repo.findBySearchId("search-2");

      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
      expect(found!.searchId).toBe("search-2");
    });

    it("returns null when finding a non-existent searchId", async () => {
      const repo = new InMemorySearchResultRepository();
      setSearchResultRepositoryForTests(repo);

      const found = await repo.findBySearchId("non-existent-search");
      expect(found).toBeNull();
    });
  });

  describe("immutability", () => {
    it("does not expose an update method", () => {
      const repo = new InMemorySearchResultRepository();
      expect(typeof repo.save).toBe("function");
      expect(typeof repo.findById).toBe("function");
      expect(typeof repo.findBySearchId).toBe("function");
      // @ts-expect-error — update should not exist
      expect(repo.update).toBeUndefined();
    });
  });
});
