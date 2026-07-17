import { getSessionFromRequest, type Session } from "../auth/session";
import { createTopicProposal, findSimilarTopics } from "./proposals";
import {
  createPostgresTopicProposalRepository,
  type TopicProposalUserRepository,
} from "./proposals.repository";

export type TopicProposalsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  repository?: TopicProposalRouteRepository;
};

export type TopicProposalRouteRepository = {
  findSimilarTopics(
    candidateName: string,
  ): Promise<{ name: string; type: "active" | "pending" }[]>;
  findPendingByUserAndName(
    userId: string,
    candidateName: string,
  ): Promise<{ id: string } | null>;
  insertProposal(
    userId: string,
    candidateName: string,
  ): Promise<{
    id: string;
    candidateName: string;
    status: string;
    createdAt: Date;
  }>;
};

let cachedTopicProposalRouteRepository: TopicProposalRouteRepository | null =
  null;

export function getTopicProposalRouteRepository(): TopicProposalRouteRepository {
  if (!cachedTopicProposalRouteRepository) {
    cachedTopicProposalRouteRepository = createTopicProposalRouteRepository();
  }
  return cachedTopicProposalRouteRepository;
}

export function createTopicProposalsHandlers({
  getSession = getSessionFromRequest,
  repository,
}: TopicProposalsDependencies = {}) {
  const resolveRepository = () =>
    repository ?? getTopicProposalRouteRepository();
  return {
    async POST(request: Request): Promise<Response> {
      const session = await getSession(request);

      if (!session) {
        return Response.json({ error: "unauthenticated" }, { status: 401 });
      }

      let candidateName: unknown;

      try {
        const body = (await request.json()) as { candidateName?: unknown };
        candidateName = body.candidateName;
      } catch {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }

      if (typeof candidateName !== "string") {
        return Response.json({ error: "invalid_name" }, { status: 400 });
      }

      const result = await createTopicProposal(
        session.user.id,
        candidateName,
        resolveRepository(),
      );

      if (!result.ok) {
        if (result.reason === "too_similar") {
          return Response.json(
            { error: "too_similar", matches: result.matches },
            { status: 409 },
          );
        }
        if (result.reason === "already_pending") {
          return Response.json(
            { error: "already_pending", proposalId: result.proposalId },
            { status: 409 },
          );
        }
        return Response.json({ error: "invalid_name" }, { status: 400 });
      }

      return Response.json(
        {
          id: result.proposal.id,
          candidateName: result.proposal.candidateName,
          status: result.proposal.status,
          createdAt: result.proposal.createdAt,
        },
        { status: 201 },
      );
    },
  };
}

export function createTopicProposalRouteRepository(
  userRepository: TopicProposalUserRepository = createPostgresTopicProposalRepository(),
): TopicProposalRouteRepository {
  return {
    async findSimilarTopics(candidateName) {
      return findSimilarTopics(candidateName, {
        listActiveTopics: () => userRepository.listActiveTopics(),
        listPendingProposals: () => userRepository.listPendingForSimilarity(),
      });
    },
    findPendingByUserAndName: (userId, candidateName) =>
      userRepository.findPendingByUserAndName(userId, candidateName),
    insertProposal: (userId, candidateName) =>
      userRepository.insertProposal(userId, candidateName),
  };
}
