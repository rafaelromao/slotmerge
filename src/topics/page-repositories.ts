import { and, asc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { topicProposals, topics, userTopics } from "../db/schema";

import type {
  TopicRow,
  TopicProposalRow,
  TopicWorkflowCatalogRepository,
  TopicWorkflowProposalRepository,
} from "./topic-workflow";

export type TopicsPageRepositories = {
  catalogue: TopicWorkflowCatalogRepository;
  proposals: TopicWorkflowProposalRepository;
};

let catalogueOverride: TopicWorkflowCatalogRepository | null = null;
let proposalsOverride: TopicWorkflowProposalRepository | null = null;

export function setTopicsPageCatalogueRepositoryForTests(
  repository: TopicWorkflowCatalogRepository | null,
): void {
  catalogueOverride = repository;
}

export function setTopicsPageProposalsRepositoryForTests(
  repository: TopicWorkflowProposalRepository | null,
): void {
  proposalsOverride = repository;
}

export function buildTopicsPageRepositories(): TopicsPageRepositories {
  const db = getDb();
  return {
    catalogue: catalogueOverride ?? {
      async listActive(): Promise<TopicRow[]> {
        const rows = await db
          .select({
            id: topics.id,
            name: topics.name,
            status: topics.status,
          })
          .from(topics)
          .where(eq(topics.status, "active"))
          .orderBy(topics.name);
        return rows;
      },
      async listSelectedTopicIds(userId) {
        const rows = await db
          .select({ topicId: userTopics.topicId })
          .from(userTopics)
          .where(
            and(eq(userTopics.userId, userId), eq(userTopics.status, "active")),
          )
          .orderBy(userTopics.createdAt);
        return rows.map((row) => row.topicId);
      },
    },
    proposals: proposalsOverride ?? {
      async listUserProposals(userId: string): Promise<TopicProposalRow[]> {
        const rows = await db
          .select({
            id: topicProposals.id,
            candidateName: topicProposals.candidateName,
            status: topicProposals.status,
          })
          .from(topicProposals)
          .where(eq(topicProposals.proposedByUserId, userId))
          .orderBy(asc(topicProposals.createdAt));
        return rows;
      },
    },
  };
}
