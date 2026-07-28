import { err, ok, type Result } from "../lib/result";
import type { Clock } from "../system/clock";
import type {
  AdminTopicListItem,
  AdminTopicProposalListItem,
} from "../topics/repository";
import type {
  DecideProposalResult,
  DecideProposalStatus,
} from "../topics/proposals.repository";

export type AdminTopicsLoadOk = {
  activeTopics: AdminTopicListItem[];
  pendingProposals: AdminTopicProposalListItem[];
  pendingCount: number;
  activeCount: number;
};

export type AdminTopicsDecideOk = {
  topicId: string | null;
};

export type AdminTopicsDecideError =
  "proposal_not_found" | "proposal_already_decided" | "internal_error";

export type AdminTopicsRetireError =
  | "cannot_retire_own_proposal"
  | "topic_not_found"
  | "topic_already_retired"
  | "confirm_name_required"
  | "confirm_name_mismatch"
  | "internal_error";

export type AdminTopicsRepository = {
  listActiveTopics(): Promise<AdminTopicListItem[]>;
  listPendingProposals(): Promise<AdminTopicProposalListItem[]>;
  findTopic(id: string): Promise<AdminTopicListItem | null>;
  decideProposal(input: {
    actorId: string;
    proposalId: string;
    status: DecideProposalStatus;
    now: Date;
  }): Promise<DecideProposalResult>;
  retireTopic(input: { actorId: string; topicId: string; now: Date }): Promise<
    | {
        ok: true;
      }
    | { ok: false; reason: "not_found" | "already_retired" }
  >;
};

export type AdminTopicsWorkflowDependencies = {
  repository: AdminTopicsRepository;
  clock: Clock;
};

export type AdminTopicsWorkflow = {
  load(): Promise<Result<AdminTopicsLoadOk, never>>;
  decideProposal(input: {
    actorId: string;
    proposalId: string;
    status: DecideProposalStatus;
  }): Promise<Result<AdminTopicsDecideOk, AdminTopicsDecideError>>;
  retireTopic(input: {
    actorId: string;
    topicId: string;
    confirmName: string | null;
  }): Promise<Result<void, AdminTopicsRetireError>>;
};

export function createAdminTopicsWorkflow(
  deps: AdminTopicsWorkflowDependencies,
): AdminTopicsWorkflow {
  const { repository, clock } = deps;

  return {
    async load(): Promise<Result<AdminTopicsLoadOk, never>> {
      const [activeTopics, pendingProposals] = await Promise.all([
        repository.listActiveTopics(),
        repository.listPendingProposals(),
      ]);
      return ok({
        activeTopics,
        pendingProposals,
        activeCount: activeTopics.length,
        pendingCount: pendingProposals.length,
      });
    },

    async decideProposal({
      actorId,
      proposalId,
      status,
    }): Promise<Result<AdminTopicsDecideOk, AdminTopicsDecideError>> {
      const result = await repository.decideProposal({
        actorId,
        proposalId,
        status,
        now: clock.now(),
      });
      if (result.ok) {
        return ok({ topicId: result.topicId });
      }
      return err(result.reason);
    },

    async retireTopic({
      actorId,
      topicId,
      confirmName,
    }): Promise<Result<void, AdminTopicsRetireError>> {
      const topic = await repository.findTopic(topicId);
      if (!topic) {
        return err("topic_not_found");
      }

      if (topic.proposedByUserId && topic.proposedByUserId === actorId) {
        return err("cannot_retire_own_proposal");
      }

      const trimmed = (confirmName ?? "").trim();
      if (trimmed.length === 0) {
        return err("confirm_name_required");
      }

      if (trimmed.toLowerCase() !== topic.name.toLowerCase()) {
        return err("confirm_name_mismatch");
      }

      if (topic.status === "retired") {
        return err("topic_already_retired");
      }

      const result = await repository.retireTopic({
        actorId,
        topicId,
        now: clock.now(),
      });
      if (!result.ok) {
        if (result.reason === "not_found") {
          return err("topic_not_found");
        }
        return err("topic_already_retired");
      }
      return ok(undefined);
    },
  };
}
