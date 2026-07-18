import { getSessionFromRequest, type Session } from "../auth/session";
import {
  createPostgresTopicProposalRepository,
  type TopicProposalUserRepository,
} from "./proposals.repository";

export type { TopicProposalUserRepository, UserTopicProposal } from "./proposals.repository";

export type MeTopicProposalsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  repository?: TopicProposalUserRepository;
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
      const proposals = await repo.listUserProposals(session.user.id);

      return Response.json({ proposals });
    },
  };
}

let repositoryOverride: TopicProposalUserRepository | null = null;

export function setMeTopicProposalsRepositoryForTests(
  repository: TopicProposalUserRepository | null,
) {
  repositoryOverride = repository;
}

function getMeTopicProposalsRepository(): TopicProposalUserRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }
  return createPostgresTopicProposalRepository();
}
