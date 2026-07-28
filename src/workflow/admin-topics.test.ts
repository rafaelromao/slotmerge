import { describe, expect, it, vi } from "vitest";

import {
  createAdminTopicsWorkflow,
  type AdminTopicsRepository,
} from "./admin-topics";

const fixedNow = new Date("2026-07-12T12:00:00.000Z");

function buildRepository(
  overrides: Partial<AdminTopicsRepository> = {},
): AdminTopicsRepository {
  return {
    listPendingProposals: vi.fn().mockResolvedValue([]),
    listActiveTopics: vi.fn().mockResolvedValue([]),
    findTopic: vi.fn().mockResolvedValue(null),
    decideProposal: vi.fn(),
    retireTopic: vi.fn(),
    ...overrides,
  };
}

const fixedClock = { now: () => fixedNow };

describe("adminTopicsWorkflow", () => {
  describe("load", () => {
    it("returns the active topic list, pending proposals, and counts", async () => {
      const listActiveTopics = vi.fn().mockResolvedValue([
        {
          id: "topic-1",
          name: "Sailing",
          status: "active" as const,
          proposedByUserId: null,
          retiredAt: null,
          createdAt: fixedNow,
        },
        {
          id: "topic-2",
          name: "Identity and access",
          status: "active" as const,
          proposedByUserId: "admin-1",
          retiredAt: null,
          createdAt: fixedNow,
        },
      ]);
      const listPendingProposals = vi.fn().mockResolvedValue([
        {
          id: "proposal-1",
          candidateName: "Distributed tracing",
          proposedByUserId: "user-1",
          proposedByUserEmail: "user@example.com",
          createdAt: fixedNow,
        },
      ]);

      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({
          listActiveTopics,
          listPendingProposals,
        }),
        clock: fixedClock,
      });

      const result = await workflow.load();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.activeTopics).toHaveLength(2);
      expect(result.value.pendingProposals).toHaveLength(1);
      expect(result.value.activeCount).toBe(2);
      expect(result.value.pendingCount).toBe(1);
    });
  });

  describe("decideProposal (approve)", () => {
    it("approves a pending proposal through the repository decideProposal method", async () => {
      const decideProposal = vi.fn().mockResolvedValue({
        ok: true,
        topicId: "topic-new",
      });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ decideProposal }),
        clock: fixedClock,
      });

      const result = await workflow.decideProposal({
        actorId: "admin-1",
        proposalId: "proposal-1",
        status: "approved",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ topicId: "topic-new" });
      expect(decideProposal).toHaveBeenCalledWith({
        actorId: "admin-1",
        proposalId: "proposal-1",
        status: "approved",
        now: fixedNow,
      });
    });

    it("rejects a pending proposal through the repository decideProposal method", async () => {
      const decideProposal = vi.fn().mockResolvedValue({
        ok: true,
        topicId: null,
      });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ decideProposal }),
        clock: fixedClock,
      });

      const result = await workflow.decideProposal({
        actorId: "admin-1",
        proposalId: "proposal-1",
        status: "rejected",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ topicId: null });
      expect(decideProposal).toHaveBeenCalledWith({
        actorId: "admin-1",
        proposalId: "proposal-1",
        status: "rejected",
        now: fixedNow,
      });
    });

    it("surfaces the proposal_not_found branch from the repository", async () => {
      const decideProposal = vi.fn().mockResolvedValue({
        ok: false,
        reason: "proposal_not_found",
      });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ decideProposal }),
        clock: fixedClock,
      });

      const result = await workflow.decideProposal({
        actorId: "admin-1",
        proposalId: "missing",
        status: "approved",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("proposal_not_found");
    });

    it("surfaces the proposal_already_decided branch from the repository", async () => {
      const decideProposal = vi.fn().mockResolvedValue({
        ok: false,
        reason: "proposal_already_decided",
      });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ decideProposal }),
        clock: fixedClock,
      });

      const result = await workflow.decideProposal({
        actorId: "admin-1",
        proposalId: "decided",
        status: "approved",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("proposal_already_decided");
    });
  });

  describe("retireTopic", () => {
    it("returns cannot_retire_own_proposal when the actor proposed the topic, regardless of confirmName", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Identity and access",
        status: "active" as const,
        proposedByUserId: "admin-1",
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn();
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-1",
        topicId: "topic-1",
        confirmName: "Identity and access",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("cannot_retire_own_proposal");
      expect(retireTopic).not.toHaveBeenCalled();
    });

    it("returns cannot_retire_own_proposal even when the typed-confirm name does not match", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Identity and access",
        status: "active" as const,
        proposedByUserId: "admin-1",
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn();
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-1",
        topicId: "topic-1",
        confirmName: "wrong-name",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("cannot_retire_own_proposal");
      expect(retireTopic).not.toHaveBeenCalled();
    });

    it("returns topic_not_found when the topic does not exist", async () => {
      const findTopic = vi.fn().mockResolvedValue(null);
      const retireTopic = vi.fn();
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-1",
        topicId: "missing",
        confirmName: "Sailing",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("topic_not_found");
      expect(retireTopic).not.toHaveBeenCalled();
    });

    it("returns confirm_name_required when confirmName is null", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Sailing",
        status: "active" as const,
        proposedByUserId: null,
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn();
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-2",
        topicId: "topic-1",
        confirmName: null,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("confirm_name_required");
      expect(retireTopic).not.toHaveBeenCalled();
    });

    it("returns confirm_name_required when confirmName is empty after trim", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Sailing",
        status: "active" as const,
        proposedByUserId: null,
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn();
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-2",
        topicId: "topic-1",
        confirmName: "   ",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("confirm_name_required");
      expect(retireTopic).not.toHaveBeenCalled();
    });

    it("returns confirm_name_mismatch when the typed-confirm name does not match the topic name", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Sailing",
        status: "active" as const,
        proposedByUserId: null,
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn();
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-2",
        topicId: "topic-1",
        confirmName: "wrong-name",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("confirm_name_mismatch");
      expect(retireTopic).not.toHaveBeenCalled();
    });

    it("accepts a case-insensitive typed-confirm match", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Sailing",
        status: "active" as const,
        proposedByUserId: null,
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn().mockResolvedValue({ ok: true });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-2",
        topicId: "topic-1",
        confirmName: "SAILING",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(retireTopic).toHaveBeenCalledWith({
        actorId: "admin-2",
        topicId: "topic-1",
        now: fixedNow,
      });
    });

    it("returns topic_already_retired from the repository", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Sailing",
        status: "retired" as const,
        proposedByUserId: null,
        retiredAt: fixedNow,
        createdAt: fixedNow,
      });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-2",
        topicId: "topic-1",
        confirmName: "Sailing",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("topic_already_retired");
    });

    it("retires a topic with a matching typed-confirm name when the actor is not the proposer", async () => {
      const findTopic = vi.fn().mockResolvedValue({
        id: "topic-1",
        name: "Sailing",
        status: "active" as const,
        proposedByUserId: null,
        retiredAt: null,
        createdAt: fixedNow,
      });
      const retireTopic = vi.fn().mockResolvedValue({ ok: true });
      const workflow = createAdminTopicsWorkflow({
        repository: buildRepository({ findTopic, retireTopic }),
        clock: fixedClock,
      });

      const result = await workflow.retireTopic({
        actorId: "admin-2",
        topicId: "topic-1",
        confirmName: "  Sailing  ",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(retireTopic).toHaveBeenCalledWith({
        actorId: "admin-2",
        topicId: "topic-1",
        now: fixedNow,
      });
    });
  });
});
