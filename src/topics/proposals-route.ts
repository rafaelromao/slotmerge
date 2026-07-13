import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  topicProposals,
  topics,
} from "../db/schema";
import { getSessionFromRequest, type Session } from "../auth/session";
import {
  createTopicProposal,
  findSimilarTopics,
} from "./proposals";

export type TopicProposalsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  repository?: TopicProposalRouteRepository;
};

export type TopicProposalRouteRepository = {
  findSimilarTopics(candidateName: string): Promise<
    { name: string; type: "active" | "pending" }[]
  >;
  findPendingByUserAndName(
    userId: string,
    candidateName: string,
  ): Promise<{ id: string } | null>;
  insertProposal(
    userId: string,
    candidateName: string,
  ): Promise<{ id: string; candidateName: string; status: string; createdAt: Date }>;
};

export function createTopicProposalsHandlers({
  getSession = getSessionFromRequest,
  repository = databaseTopicProposalRouteRepository,
}: TopicProposalsDependencies = {}) {
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
        repository,
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

const databaseTopicProposalRouteRepository: TopicProposalRouteRepository = {
  async findSimilarTopics(candidateName) {
    const matches = await findSimilarTopics(candidateName, {
      listActiveTopics: async () => {
        const rows = await getDb()
          .select({ id: topics.id, name: topics.name, status: topics.status })
          .from(topics)
          .where(eq(topics.status, "active"));
        return rows;
      },
      listPendingProposals: async () => {
        const rows = await getDb()
          .select({
            id: topicProposals.id,
            candidateName: topicProposals.candidateName,
            status: topicProposals.status,
          })
          .from(topicProposals)
          .where(eq(topicProposals.status, "pending"));
        return rows;
      },
    });
    return matches;
  },

  async findPendingByUserAndName(userId, candidateName) {
    const [row] = await getDb()
      .select({ id: topicProposals.id })
      .from(topicProposals)
      .where(
        eq(topicProposals.proposedByUserId, userId) &&
          eq(topicProposals.candidateName, candidateName) &&
          eq(topicProposals.status, "pending"),
      )
      .limit(1);
    return row ?? null;
  },

  async insertProposal(userId, candidateName) {
    const [row] = await getDb()
      .insert(topicProposals)
      .values({
        proposedByUserId: userId,
        candidateName,
        status: "pending",
      })
      .returning({
        id: topicProposals.id,
        candidateName: topicProposals.candidateName,
        status: topicProposals.status,
        createdAt: topicProposals.createdAt,
      });
    return row;
  },

};
