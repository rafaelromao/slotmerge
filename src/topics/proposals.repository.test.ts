import { describe, expect, it, vi } from "vitest";

import { createPostgresTopicProposalRepository } from "./proposals.repository";

describe("createPostgresTopicProposalRepository", () => {
  it("listPending joins the proposer and orders by createdAt desc", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        id: "proposal-1",
        candidateName: "Sailing",
        status: "pending",
        proposedByUserId: "user-1",
        proposedByUserEmail: "user@example.com",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const leftJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ leftJoin });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const rows = await repo.listPending();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "proposal-1",
      candidateName: "Sailing",
      proposedByUserEmail: "user@example.com",
    });
  });

  it("approve creates a topic, marks the proposal approved using explicit now, and returns the new topic id", async () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    const proposalLimit = vi.fn().mockResolvedValue([
      {
        id: "proposal-1",
        candidateName: "Sailing",
        status: "pending",
      },
    ]);
    const proposalWhere = vi.fn().mockReturnValue({ limit: proposalLimit });
    const proposalFrom = vi.fn().mockReturnValue({ where: proposalWhere });
    const select = vi.fn().mockReturnValue({ from: proposalFrom });

    const txInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "topic-1" }]),
      }),
    });
    const txUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
    const tx = { insert: txInsert, update: txUpdate };

    type Tx = typeof tx;
    const db = {
      select,
      transaction: vi
        .fn()
        .mockImplementation(async (handler: (tx: Tx) => Promise<unknown>) =>
          handler(tx),
        ),
    };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const result = await repo.approve({ id: "proposal-1", now });

    expect(result).toEqual({ ok: true, topicId: "topic-1" });
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdateSet).toHaveBeenCalledWith({
      status: "approved",
      updatedAt: now,
    });
  });

  it("approve reports already_processed when the proposal is not pending", async () => {
    const where = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([{ status: "approved" }]),
    });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const insert = vi.fn();
    const update = vi.fn();
    const transaction = vi.fn();
    const db = { select, insert, update, transaction };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const result = await repo.approve({
      id: "proposal-1",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "already_processed" });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reject forwards the explicit now timestamp to updatedAt", async () => {
    const now = new Date("2026-05-02T00:00:00.000Z");
    const limit = vi.fn().mockResolvedValue([{ status: "pending" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });

    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn().mockReturnValue({ set });
    const db = { select, update };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const result = await repo.reject({ id: "proposal-1", now });

    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith({ status: "rejected", updatedAt: now });
  });

  it("reject reports already_processed when the proposal is not pending", async () => {
    const limit = vi.fn().mockResolvedValue([{ status: "rejected" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const update = vi.fn();
    const db = { select, update };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const result = await repo.reject({
      id: "proposal-1",
      now: new Date("2026-05-02T00:00:00.000Z"),
    });

    expect(result).toEqual({ ok: false, reason: "already_processed" });
    expect(update).not.toHaveBeenCalled();
  });

  it("insertProposal persists the proposal and returns the row", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "proposal-1",
        candidateName: "Sailing",
        status: "pending",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);
    const values = vi.fn().mockReturnValue({ returning });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const result = await repo.insertProposal("user-1", "Sailing");

    expect(values).toHaveBeenCalledWith({
      proposedByUserId: "user-1",
      candidateName: "Sailing",
      status: "pending",
    });
    expect(result.id).toBe("proposal-1");
  });

  it("listUserProposals filters by userId and orders by createdAt", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        id: "proposal-1",
        candidateName: "Sailing",
        status: "pending",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
    ]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select };

    const repo = createPostgresTopicProposalRepository(
      db as unknown as Parameters<
        typeof createPostgresTopicProposalRepository
      >[0],
    );

    const rows = await repo.listUserProposals("user-1");

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("proposal-1");
  });
});
