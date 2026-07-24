import { describe, expect, it, vi } from "vitest";

import { createPostgresInviteRepository } from "./invites.repository";

describe("createPostgresInviteRepository", () => {
  it("listInvites joins admins and orders by createdAt desc", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        magicLinkGeneration: 0,
      },
    ]);
    const leftJoin = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ leftJoin });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    const rows = await repo.listInvites();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "invite-1",
      email: "alice@example.com",
      invitedByAdminEmail: "admin@example.com",
    });
  });

  it("createInvite forwards explicit expiresAt and returns the persisted record", async () => {
    const now = new Date("2026-07-12T00:00:00.000Z");
    const expiresAt = new Date("2026-08-11T00:00:00.000Z");
    const insertedRow = {
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending",
      invitedByAdminId: "admin-1",
      expiresAt,
      magicLinkGeneration: 0,
    };

    const returning = vi.fn().mockResolvedValue([insertedRow]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });

    const adminLimit = vi
      .fn()
      .mockResolvedValue([{ email: "admin@example.com" }]);
    const adminWhere = vi.fn().mockReturnValue({ limit: adminLimit });
    const adminSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({ where: adminWhere }),
    });

    const db = { insert, select: adminSelect };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    const result = await repo.createInvite({
      email: "alice@example.com",
      role: "user",
      invitedByAdminId: "admin-1",
      now,
      expiresAt,
    });

    expect(values).toHaveBeenCalledWith({
      email: "alice@example.com",
      role: "user",
      status: "pending",
      invitedByAdminId: "admin-1",
      expiresAt,
      magicLinkGeneration: 0,
      createdAt: now,
      updatedAt: now,
    });
    expect(result).toEqual({
      ok: true,
      invite: {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        expiresAt,
        magicLinkGeneration: 0,
      },
    });
  });

  it("createInvite reports duplicate on Postgres unique violation", async () => {
    const returning = vi.fn().mockRejectedValue({ code: "23505" });
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    const result = await repo.createInvite({
      email: "alice@example.com",
      role: "user",
      invitedByAdminId: "admin-1",
      now: new Date("2026-07-12T00:00:00.000Z"),
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("createInvite rethrows non-unique-violation errors", async () => {
    const returning = vi.fn().mockRejectedValue(new Error("connection lost"));
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    await expect(
      repo.createInvite({
        email: "alice@example.com",
        role: "user",
        invitedByAdminId: "admin-1",
        now: new Date("2026-07-12T00:00:00.000Z"),
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      }),
    ).rejects.toThrow("connection lost");
  });

  it("refreshInvite returns not_found when the invite does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    if (!repo.refreshInvite) {
      throw new Error("refreshInvite seam not implemented");
    }
    const result = await repo.refreshInvite({
      inviteId: "missing",
      now: new Date("2026-07-12T00:00:00.000Z"),
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("refreshInvite updates the existing row in place without inserting", async () => {
    const now = new Date("2026-07-12T00:00:00.000Z");
    const expiresAt = new Date("2026-08-11T00:00:00.000Z");
    const updatedRow = {
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending",
      invitedByAdminId: "admin-1",
      magicLinkGeneration: 3,
      expiresAt,
    };

    const findLimit = vi.fn().mockResolvedValue([
      {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "revoked",
        invitedByAdminId: "admin-1",
        magicLinkGeneration: 2,
        expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    const findWhere = vi.fn().mockReturnValue({ limit: findLimit });
    const findFrom = vi.fn().mockReturnValue({ where: findWhere });

    const userLookupLimit = vi.fn().mockResolvedValue([]);
    const userLookupWhere = vi.fn().mockReturnValue({ limit: userLookupLimit });
    const userLookupFrom = vi.fn().mockReturnValue({ where: userLookupWhere });

    const adminLookupLimit = vi
      .fn()
      .mockResolvedValue([{ email: "admin@example.com" }]);
    const adminLookupWhere = vi
      .fn()
      .mockReturnValue({ limit: adminLookupLimit });
    const adminLookupFrom = vi
      .fn()
      .mockReturnValue({ where: adminLookupWhere });

    const select = vi
      .fn()
      .mockReturnValueOnce({ from: findFrom })
      .mockReturnValueOnce({ from: userLookupFrom })
      .mockReturnValueOnce({ from: adminLookupFrom });

    const returning = vi.fn().mockResolvedValue([updatedRow]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const insert = vi.fn();
    const db = { select, update, insert };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    if (!repo.refreshInvite) {
      throw new Error("refreshInvite seam not implemented");
    }
    const result = await repo.refreshInvite({
      inviteId: "invite-1",
      now,
      expiresAt,
    });

    // insert must NOT be called — that is the entire point of the transaction fix
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      status: "pending",
      expiresAt,
      magicLinkGeneration: 3,
      updatedAt: now,
    });
    expect(where).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      invite: {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        expiresAt,
        magicLinkGeneration: 3,
      },
    });
  });

  it("refreshInvite returns user_already_active when an active user owns the email", async () => {
    const findLimit = vi.fn().mockResolvedValue([
      {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "revoked",
        invitedByAdminId: "admin-1",
        magicLinkGeneration: 0,
        expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    const findWhere = vi.fn().mockReturnValue({ limit: findLimit });
    const findFrom = vi.fn().mockReturnValue({ where: findWhere });

    const userLookupLimit = vi.fn().mockResolvedValue([{ id: "user-1" }]);
    const userLookupWhere = vi.fn().mockReturnValue({ limit: userLookupLimit });
    const userLookupFrom = vi.fn().mockReturnValue({ where: userLookupWhere });

    const select = vi
      .fn()
      .mockReturnValueOnce({ from: findFrom })
      .mockReturnValueOnce({ from: userLookupFrom });

    const update = vi.fn();
    const insert = vi.fn();
    const db = { select, update, insert };

    const repo = createPostgresInviteRepository(
      db as unknown as Parameters<typeof createPostgresInviteRepository>[0],
    );

    if (!repo.refreshInvite) {
      throw new Error("refreshInvite seam not implemented");
    }
    const result = await repo.refreshInvite({
      inviteId: "invite-1",
      now: new Date("2026-07-12T00:00:00.000Z"),
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, reason: "user_already_active" });
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
