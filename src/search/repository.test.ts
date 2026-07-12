import { afterEach, describe, expect, it } from "vitest";

import { InMemorySearchRepository } from "./in-memory-repository";
import { getSearchRepository, setSearchRepositoryForTests } from "./repository";
import type { SearchRecord } from "./repository";

const fixedGeneratedAt = new Date("2026-07-08T15:00:00.000Z");

const baseRecord: SearchRecord = {
  organizerId: "organizer-1",
  selectedTopicIds: ["topic-1"],
  minimumMatchingUsers: 2,
  durationMinutes: 60,
  dateRangeStart: new Date("2026-07-06T03:00:00.000Z"),
  dateRangeEnd: new Date("2026-08-10T03:00:00.000Z"),
  organizerTimezone: "America/Sao_Paulo",
  generatedAt: fixedGeneratedAt,
};

describe("SearchRepository contract", () => {
  it("saves a record and assigns an id when one is missing", async () => {
    const repo = new InMemorySearchRepository();
    const stored = await repo.save(baseRecord);
    const storedId = stored.id as string;

    expect(storedId).toBeTypeOf("string");
    expect(storedId.length).toBeGreaterThan(0);
    expect(stored.organizerId).toBe("organizer-1");
    expect(stored.generatedAt).toBe(fixedGeneratedAt);
    expect(stored.snapshotReference).toBeUndefined();
  });

  it("preserves a caller-supplied id when saving", async () => {
    const repo = new InMemorySearchRepository();
    const stored = await repo.save({ ...baseRecord, id: "search-123" });

    expect(stored.id).toBe("search-123");
  });

  it("does not write a snapshot reference on save", async () => {
    const repo = new InMemorySearchRepository();
    const stored = await repo.save(baseRecord);

    expect(stored.snapshotReference).toBeUndefined();
  });

  it("finds a record by id", async () => {
    const repo = new InMemorySearchRepository();
    const stored = await repo.save(baseRecord);
    const storedId = stored.id as string;
    const found = await repo.findById(storedId);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(storedId);
  });

  it("returns null for an unknown id", async () => {
    const repo = new InMemorySearchRepository();
    await expect(repo.findById("does-not-exist")).resolves.toBeNull();
  });

  it("lists records by organizer ordered by generatedAt desc", async () => {
    const repo = new InMemorySearchRepository();

    await repo.save({
      ...baseRecord,
      generatedAt: new Date("2026-07-01T12:00:00.000Z"),
    });
    await repo.save({
      ...baseRecord,
      generatedAt: new Date("2026-07-08T12:00:00.000Z"),
    });
    await repo.save({
      ...baseRecord,
      organizerId: "organizer-2",
      generatedAt: new Date("2026-07-09T12:00:00.000Z"),
    });

    const organizer1 = await repo.listByOrganizer("organizer-1");
    expect(organizer1.length).toBe(2);
    expect(organizer1[0]?.generatedAt.toISOString()).toBe(
      "2026-07-08T12:00:00.000Z",
    );
    expect(organizer1[1]?.generatedAt.toISOString()).toBe(
      "2026-07-01T12:00:00.000Z",
    );
  });
});

describe("SearchRepository override wiring", () => {
  afterEach(() => {
    setSearchRepositoryForTests(null);
  });

  it("returns the override repository when set", () => {
    const repo = new InMemorySearchRepository();
    setSearchRepositoryForTests(repo);

    expect(getSearchRepository()).toBe(repo);
  });

  it("returns a working repository even when no override is set (Postgres-backed)", () => {
    setSearchRepositoryForTests(null);

    const repository = getSearchRepository();
    expect(repository).toBeDefined();
    expect(typeof repository.save).toBe("function");
    expect(typeof repository.findById).toBe("function");
    expect(typeof repository.listByOrganizer).toBe("function");
  });
});
