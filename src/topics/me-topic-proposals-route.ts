import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { topicProposals, type TopicProposalStatus } from "../db/schema";
import { getSessionFromRequest, type Session } from "../auth/session";

export type UserTopicProposal = {
  id: string;
  candidateName: string;
  status: TopicProposalStatus;
  createdAt: Date;
};

export type MeTopicProposalsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  repository?: MeTopicProposalsRepository;
};

export type MeTopicProposalsRepository = {
  listUserTopicProposals(userId: string): Promise<UserTopicProposal[]>;
};

export function createMeTopicProposalsHandlers({
  getSession = getSessionFromRequest,
  repository,
}: MeTopicProposalsDependencies = {}) {
  return {
    async GET(request: Request): Promise<Response> {
      const session = await getSession(request);

      if (!session) {
        return Response.json({ error: "unauthenticated" }, { status: 401 });
      }

      const repo = repository ?? getMeTopicProposalsRepository();
      const proposals = await repo.listUserTopicProposals(session.user.id);

      return Response.json({ proposals });
    },
  };
}

let repositoryOverride: MeTopicProposalsRepository | null = null;

export function setMeTopicProposalsRepositoryForTests(
  repository: MeTopicProposalsRepository | null,
) {
  repositoryOverride = repository;
}

function getMeTopicProposalsRepository(): MeTopicProposalsRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }
  return databaseMeTopicProposalsRepository;
}

const databaseMeTopicProposalsRepository: MeTopicProposalsRepository = {
  async listUserTopicProposals(userId) {
    const rows = await getDb()
      .select({
        id: topicProposals.id,
        candidateName: topicProposals.candidateName,
        status: topicProposals.status,
        createdAt: topicProposals.createdAt,
      })
      .from(topicProposals)
      .where(eq(topicProposals.proposedByUserId, userId))
      .orderBy(topicProposals.createdAt);
    return rows;
  },
};
