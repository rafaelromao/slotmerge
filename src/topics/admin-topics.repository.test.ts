import { describe, expect, it, vi } from "vitest";

import {
  createPostgresTopicCatalogueRepository,
  getTopicCatalogueRepository,
  setTopicCatalogueRepositoryForTests,
} from "../topics/repository";

function buildDb() {
  return {
    select: vi.fn(),
    update: vi.fn(),
  };
}

describe("topic catalogue admin repository", () => {
  it("listActiveAdminTopics returns every topic ordered by name", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        id: "topic-1",
        name: "AI engineering",
        status: "active",
        retiredAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "topic-2",
        name: "Product strategy",
        status: "retired",
        retiredAt: new Date("2026-02-01T00:00:00.000Z"),
        createdAt: new Date("2025-12-01T00:00:00.000Z"),
      },
    ]);
    const from = vi.fn().mockReturnValue({ orderBy });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const repo = createPostgresTopicCatalogueRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicCatalogueRepository
      >[0],
    );

    const items = await repo.listActiveAdminTopics();

    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("AI engineering");
    expect(items[1].status).toBe("retired");
  });

  it("retire forwards the explicit now timestamp to retiredAt and updatedAt", async () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    const selectLimit = vi.fn().mockResolvedValue([{ status: "active" }]);
    const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
    const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const select = vi.fn().mockReturnValue({ from: selectFrom });
    const db = { select, update };

    const repo = createPostgresTopicCatalogueRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicCatalogueRepository
      >[0],
    );

    const result = await repo.retire({ id: "topic-1", now });

    expect(result).toEqual({ ok: true });
    expect(updateSet).toHaveBeenCalledWith({
      status: "retired",
      retiredAt: now,
      updatedAt: now,
    });
  });

  it("retire reports not_found when the topic does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const update = vi.fn();
    const db = { select, update };

    const repo = createPostgresTopicCatalogueRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicCatalogueRepository
      >[0],
    );

    const result = await repo.retire({
      id: "missing",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(update).not.toHaveBeenCalled();
  });

  it("retire reports already_retired when the topic is already retired", async () => {
    const limit = vi.fn().mockResolvedValue([{ status: "retired" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const update = vi.fn();
    const db = { select, update };

    const repo = createPostgresTopicCatalogueRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicCatalogueRepository
      >[0],
    );

    const result = await repo.retire({
      id: "topic-1",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "already_retired" });
    expect(update).not.toHaveBeenCalled();
  });

  it("getTopicCatalogueRepository exposes the admin ops through the shared interface", async () => {
    setTopicCatalogueRepositoryForTests(null);
    const repository = getTopicCatalogueRepository();
    expect(typeof repository.listActiveAdminTopics).toBe("function");
    expect(typeof repository.retire).toBe("function");
  });
});
