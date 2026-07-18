import { describe, expect, it, vi } from "vitest";

import { createPostgresAdminUserRepository } from "./users.repository";

describe("createPostgresAdminUserRepository", () => {
  it("lists users ordered by createdAt", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        id: "u-1",
        email: "ada@example.com",
        displayName: "Ada",
        role: "user",
        status: "active",
      },
    ]);
    const from = vi.fn().mockReturnValue({ orderBy });
    const db = { select: vi.fn().mockReturnValue({ from }) };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const rows = await repo.listUsers();

    expect(rows).toEqual([
      {
        id: "u-1",
        email: "ada@example.com",
        displayName: "Ada",
        role: "user",
        status: "active",
      },
    ]);
  });

  it("changeRole forwards the supplied now timestamp to updatedAt", async () => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    const returning = vi.fn().mockResolvedValue([{ id: "u-2" }]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.changeRole({
      userId: "u-2",
      actingAdminId: "admin-1",
      role: "organizer",
      now,
    });

    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith({ role: "organizer", updatedAt: now });
  });

  it("changeRole rejects when the admin targets themselves", async () => {
    const db = { update: vi.fn() };
    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.changeRole({
      userId: "admin-1",
      actingAdminId: "admin-1",
      role: "user",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "self" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("changeRole reports not_found when no row is updated", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.changeRole({
      userId: "missing",
      actingAdminId: "admin-1",
      role: "user",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("suspend forwards the supplied now timestamp to updatedAt", async () => {
    const now = new Date("2026-01-03T03:04:05.000Z");
    const returning = vi.fn().mockResolvedValue([{ id: "u-3" }]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.suspend({
      userId: "u-3",
      actingAdminId: "admin-1",
      now,
    });

    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith({ status: "suspended", updatedAt: now });
  });

  it("suspend rejects when the admin targets themselves", async () => {
    const db = { update: vi.fn() };
    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.suspend({
      userId: "admin-1",
      actingAdminId: "admin-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "self" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("suspend reports already_suspended when the user is not active", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });

    const from = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: "u-3" }]),
      }),
    });
    const select = vi.fn().mockReturnValue({ from });
    const db = { update, select };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.suspend({
      userId: "u-3",
      actingAdminId: "admin-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "already_suspended" });
  });

  it("suspend reports not_found when the user does not exist", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });

    const from = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const select = vi.fn().mockReturnValue({ from });
    const db = { update, select };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.suspend({
      userId: "missing",
      actingAdminId: "admin-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("reinstate forwards the supplied now timestamp to updatedAt", async () => {
    const now = new Date("2026-01-04T03:04:05.000Z");
    const returning = vi.fn().mockResolvedValue([{ id: "u-4" }]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.reinstate({
      userId: "u-4",
      actingAdminId: "admin-1",
      now,
    });

    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith({ status: "active", updatedAt: now });
  });

  it("reinstate rejects when the admin targets themselves", async () => {
    const db = { update: vi.fn() };
    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.reinstate({
      userId: "admin-1",
      actingAdminId: "admin-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "self" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("reinstate reports already_active when the user is not suspended", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });

    const from = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: "u-4" }]),
      }),
    });
    const select = vi.fn().mockReturnValue({ from });
    const db = { update, select };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.reinstate({
      userId: "u-4",
      actingAdminId: "admin-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "already_active" });
  });

  it("reinstate reports not_found when the user does not exist", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning }),
    });
    const update = vi.fn().mockReturnValue({ set });

    const from = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const select = vi.fn().mockReturnValue({ from });
    const db = { update, select };

    const repo = createPostgresAdminUserRepository(
      db as unknown as Parameters<typeof createPostgresAdminUserRepository>[0],
    );

    const result = await repo.reinstate({
      userId: "missing",
      actingAdminId: "admin-1",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
