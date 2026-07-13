import Levenshtein from "fast-levenshtein";

import type { TopicStatus, TopicProposalStatus } from "../db/schema";

const SIMILARITY_THRESHOLD = 0.8;

export function computeSimilarity(a: string, b: string): number {
  const normA = normalizeTopicName(a);
  const normB = normalizeTopicName(b);

  if (normA === normB) {
    return 1.0;
  }

  const maxLen = Math.max(normA.length, normB.length);

  if (maxLen === 0) {
    return 1.0;
  }

  const distance = Levenshtein.get(normA, normB);

  return 1 - distance / maxLen;
}

export function normalizeTopicName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isSimilar(a: string, b: string): boolean {
  return computeSimilarity(a, b) >= SIMILARITY_THRESHOLD;
}

export type SimilarMatch = {
  name: string;
  type: "active" | "pending";
};

export type TopicCatalogueWithProposals = {
  listActiveTopics(): Promise<{ id: string; name: string; status: TopicStatus }[]>;
  listPendingProposals(): Promise<
    { id: string; candidateName: string; status: TopicProposalStatus }[]
  >;
};

export async function findSimilarTopics(
  candidateName: string,
  repository: TopicCatalogueWithProposals,
): Promise<SimilarMatch[]> {
  const [activeTopics, pendingProposals] = await Promise.all([
    repository.listActiveTopics(),
    repository.listPendingProposals(),
  ]);

  const matches: SimilarMatch[] = [];

  for (const topic of activeTopics) {
    if (topic.status !== "active") {
      continue;
    }
    if (isSimilar(candidateName, topic.name)) {
      matches.push({ name: topic.name, type: "active" });
    }
  }

  for (const proposal of pendingProposals) {
    if (isSimilar(candidateName, proposal.candidateName)) {
      matches.push({ name: proposal.candidateName, type: "pending" });
    }
  }

  return matches;
}

export type CreateTopicProposalResult =
  | { ok: true; proposal: { id: string; candidateName: string; status: string; createdAt: Date } }
  | { ok: false; reason: "too_similar"; matches: SimilarMatch[] }
  | { ok: false; reason: "already_pending"; proposalId: string }
  | { ok: false; reason: "invalid_name" };

export type TopicProposalDbRepository = {
  findSimilarTopics(candidateName: string): Promise<SimilarMatch[]>;
  findPendingByUserAndName(
    userId: string,
    candidateName: string,
  ): Promise<{ id: string } | null>;
  insertProposal(
    userId: string,
    candidateName: string,
  ): Promise<{ id: string; candidateName: string; status: string; createdAt: Date }>;
};

export async function createTopicProposal(
  userId: string,
  candidateName: string,
  repository: TopicProposalDbRepository,
): Promise<CreateTopicProposalResult> {
  const normalizedName = normalizeTopicName(candidateName);

  if (normalizedName === "") {
    return { ok: false, reason: "invalid_name" };
  }

  const similarMatches = await repository.findSimilarTopics(candidateName);

  if (similarMatches.length > 0) {
    return { ok: false, reason: "too_similar", matches: similarMatches };
  }

  const existingPending = await repository.findPendingByUserAndName(
    userId,
    candidateName,
  );

  if (existingPending) {
    return {
      ok: false,
      reason: "already_pending",
      proposalId: existingPending.id,
    };
  }

  const proposal = await repository.insertProposal(userId, candidateName);

  return { ok: true, proposal };
}
