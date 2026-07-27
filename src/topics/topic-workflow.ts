import {
  createTopicProposal,
  type CreateTopicProposalResult,
  type SimilarMatch,
} from "./proposals";
import type { Clock } from "../system/clock";

export const TOPIC_NAME_MIN_LENGTH = 2;
export const TOPIC_NAME_MAX_LENGTH = 60;

export type TopicStatus = "active" | "retired" | "pending";

export type TopicRow = {
  id: string;
  name: string;
  status: TopicStatus;
};

export type ProposalStatus = "pending" | "approved" | "rejected";

export type TopicProposalRow = {
  id: string;
  candidateName: string;
  status: ProposalStatus;
};

export type DisplayStatus = "pending" | "active" | "rejected" | "retired";

export type ProposalViewRow = {
  id: string;
  candidateName: string;
  displayStatus: DisplayStatus;
  topicId?: string;
};

export type TopicPageState = {
  catalogue: TopicRow[];
  selectedTopicIds: string[];
  proposals: ProposalViewRow[];
};

export type SaveSelectionError = {
  code: "invalid_topic_ids";
  invalidIds: string[];
};

export type ProposeError =
  | { code: "invalid_name" }
  | { code: "too_similar"; matches: SimilarMatch[] }
  | { code: "already_pending"; proposalId: string };

export type ProposeErrorCode = ProposeError["code"];

export type TopicWorkflowCatalogRepository = {
  listActive(): Promise<TopicRow[]>;
  listSelectedTopicIds(userId: string): Promise<string[]>;
};

export type TopicWorkflowProposalRepository = {
  listUserProposals(userId: string): Promise<TopicProposalRow[]>;
};

export type CreateTopicWorkflowDeps = {
  catalogue: TopicWorkflowCatalogRepository;
  proposals: TopicWorkflowProposalRepository;
  clock: Clock;
  replaceUserTopics?: (input: {
    userId: string;
    topicIds: string[];
    now: Date;
  }) => Promise<void>;
  createProposal?: (
    userId: string,
    candidateName: string,
    now: Date,
  ) => Promise<CreateTopicProposalResult>;
};

export type TopicWorkflow = {
  listActive(): Promise<TopicRow[]>;
  loadPageState(input: {
    userId: string;
  }): Promise<
    { ok: true; value: TopicPageState } | { ok: false; error: never }
  >;
  saveSelection(input: {
    userId: string;
    topicIds: string[];
  }): Promise<
    | { ok: true; value: { selectedTopicIds: string[] } }
    | { ok: false; error: SaveSelectionError }
  >;
  propose(input: { userId: string; candidateName: string }): Promise<
    | {
        ok: true;
        value: {
          proposal: {
            id: string;
            candidateName: string;
            status: ProposalStatus;
            createdAt: Date;
          };
        };
      }
    | { ok: false; error: ProposeError }
  >;
};

export function createTopicWorkflow(
  deps: CreateTopicWorkflowDeps,
): TopicWorkflow {
  const { catalogue, proposals, clock } = deps;
  const replaceUserTopics = deps.replaceUserTopics ?? defaultReplaceUserTopics;
  const createProposal = deps.createProposal ?? defaultCreateProposal;

  async function listActive(): Promise<TopicRow[]> {
    const rows = await catalogue.listActive();
    return rows
      .filter((row) => row.status === "active")
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    listActive,

    async loadPageState({ userId }) {
      const [activeCatalogue, selectedTopicIds, userProposals] =
        await Promise.all([
          listActive(),
          catalogue.listSelectedTopicIds(userId),
          proposals.listUserProposals(userId),
        ]);

      const catalogueByName = new Map(
        activeCatalogue.map((row) => [row.name, row] as const),
      );

      const proposalsView = userProposals.map<ProposalViewRow>((proposal) => {
        const matchedTopic = catalogueByName.get(proposal.candidateName);

        if (proposal.status === "pending") {
          return {
            id: proposal.id,
            candidateName: proposal.candidateName,
            displayStatus: "pending",
          };
        }

        if (proposal.status === "rejected") {
          return {
            id: proposal.id,
            candidateName: proposal.candidateName,
            displayStatus: "rejected",
          };
        }

        if (matchedTopic?.status === "active") {
          return {
            id: proposal.id,
            candidateName: proposal.candidateName,
            displayStatus: "active",
            topicId: matchedTopic.id,
          };
        }

        return {
          id: proposal.id,
          candidateName: proposal.candidateName,
          displayStatus: "retired",
        };
      });

      return {
        ok: true,
        value: {
          catalogue: activeCatalogue,
          selectedTopicIds,
          proposals: proposalsView,
        },
      };
    },

    async saveSelection({ userId, topicIds }) {
      const activeCatalogue = await listActive();
      const activeIds = new Set(activeCatalogue.map((row) => row.id));

      const invalidIds = topicIds.filter(
        (topicId) => topicId === "" || !activeIds.has(topicId),
      );

      if (invalidIds.length > 0) {
        return {
          ok: false,
          error: { code: "invalid_topic_ids", invalidIds },
        };
      }

      await replaceUserTopics({
        userId,
        topicIds,
        now: clock.now(),
      });

      return { ok: true, value: { selectedTopicIds: topicIds } };
    },

    async propose({ userId, candidateName }) {
      const trimmed = candidateName.trim().replace(/\s+/g, " ");

      if (trimmed.length < TOPIC_NAME_MIN_LENGTH) {
        return { ok: false, error: { code: "invalid_name" } };
      }

      if (trimmed.length > TOPIC_NAME_MAX_LENGTH) {
        return { ok: false, error: { code: "invalid_name" } };
      }

      const proposalCall = await createProposal(userId, trimmed, clock.now());

      if (proposalCall.ok) {
        return {
          ok: true,
          value: {
            proposal: {
              id: proposalCall.proposal.id,
              candidateName: proposalCall.proposal.candidateName,
              status: proposalCall.proposal.status as ProposalStatus,
              createdAt: proposalCall.proposal.createdAt,
            },
          },
        };
      }

      if (proposalCall.reason === "too_similar") {
        return {
          ok: false,
          error: { code: "too_similar", matches: proposalCall.matches },
        };
      }

      if (proposalCall.reason === "already_pending") {
        return {
          ok: false,
          error: {
            code: "already_pending",
            proposalId: proposalCall.proposalId,
          },
        };
      }

      return { ok: false, error: { code: "invalid_name" } };
    },
  };
}

async function defaultReplaceUserTopics(input: {
  userId: string;
  topicIds: string[];
  now: Date;
}): Promise<void> {
  const { replaceUserTopics } = await import("./repository");
  await replaceUserTopics({
    userId: input.userId,
    topicIds: input.topicIds,
    now: input.now,
  });
}

async function defaultCreateProposal(
  userId: string,
  candidateName: string,
  now: Date,
): Promise<CreateTopicProposalResult> {
  const { createPostgresTopicProposalRepository } =
    await import("./proposals.repository");
  const { createTopicProposalRouteRepository } =
    await import("./proposals-route");
  return createTopicProposal(
    userId,
    candidateName,
    now,
    createTopicProposalRouteRepository(createPostgresTopicProposalRepository()),
  );
}
