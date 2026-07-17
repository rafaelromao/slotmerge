import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  topicProposals,
  topics,
  users,
  type TopicProposalStatus,
} from "../db/schema";

export type TopicProposalListItem = {
  id: string;
  candidateName: string;
  status: TopicProposalStatus;
  proposedByUserId: string | null;
  proposedByUserEmail: string | null;
  createdAt: Date;
};

export type ApproveResult =
  | { ok: true; topicId: string }
  | { ok: false; reason: "already_processed" };

export type RejectResult =
  | { ok: true } | { ok: false; reason: "already_processed" };

export type UserTopicProposal = {
  id: string;
  candidateName: string;
  status: TopicProposalStatus;
  createdAt: Date;
};

export type TopicProposalUserInput = {
  id: string;
  candidateName: string;
  status: TopicProposalStatus;
  createdAt: Date;
};

export type TopicProposalRouteRecord = {
  id: string;
  candidateName: string;
  status: string;
  createdAt: Date;
};

export type TopicProposalRepository = {
  listPending(): Promise<TopicProposalListItem[]>;
  listUserProposals(userId: string): Promise<UserTopicProposal[]>;
  approve(input: { id: string; now: Date }): Promise<ApproveResult>;
  reject(input: { id: string; now: Date }): Promise<RejectResult>;
  findPendingByUserAndName(
    userId: string,
    candidateName: string,
  ): Promise<{ id: string } | null>;
  insertProposal(
    userId: string,
    candidateName: string,
  ): Promise<TopicProposalUserInput>;
  listActiveTopics(): Promise<{ id: string; name: string }[]>;
  listPendingForSimilarity(): Promise<TopicProposalUserInput[]>;
};

export function createPostgresTopicProposalRepository(
  db = getDb(),
): TopicProposalRepository {
  return {
    async listPending() {
      const rows = await db
        .select({
          id: topicProposals.id,
          candidateName: topicProposals.candidateName,
          status: topicProposals.status,
          proposedByUserId: topicProposals.proposedByUserId,
          proposedByUserEmail: users.email,
          createdAt: topicProposals.createdAt,
        })
        .from(topicProposals)
        .leftJoin(users, eq(topicProposals.proposedByUserId, users.id))
        .where(eq(topicProposals.status, "pending"))
        .orderBy(desc(topicProposals.createdAt));

      return rows;
    },

    async listUserProposals(userId) {
      const rows = await db
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

    async approve({ id, now }) {
      const [proposal] = await db
        .select({
          id: topicProposals.id,
          candidateName: topicProposals.candidateName,
          status: topicProposals.status,
        })
        .from(topicProposals)
        .where(eq(topicProposals.id, id))
        .limit(1);

      if (!proposal || proposal.status !== "pending") {
        return { ok: false, reason: "already_processed" };
      }

      const result = await db.transaction(async (tx) => {
        const [topic] = await tx
          .insert(topics)
          .values({
            name: proposal.candidateName,
            status: "active",
          })
          .returning({ id: topics.id });

        await tx
          .update(topicProposals)
          .set({ status: "approved", updatedAt: now })
          .where(eq(topicProposals.id, id));

        return { topicId: topic.id };
      });

      return { ok: true, topicId: result.topicId };
    },

    async reject({ id, now }) {
      const [proposal] = await db
        .select({ status: topicProposals.status })
        .from(topicProposals)
        .where(eq(topicProposals.id, id))
        .limit(1);

      if (!proposal || proposal.status !== "pending") {
        return { ok: false, reason: "already_processed" };
      }

      await db
        .update(topicProposals)
        .set({ status: "rejected", updatedAt: now })
        .where(eq(topicProposals.id, id));

      return { ok: true };
    },

    async findPendingByUserAndName(userId, candidateName) {
      const [row] = await db
        .select({ id: topicProposals.id })
        .from(topicProposals)
        .where(
          and(
            eq(topicProposals.proposedByUserId, userId),
            eq(topicProposals.candidateName, candidateName),
            eq(topicProposals.status, "pending"),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async insertProposal(userId, candidateName) {
      const [row] = await db
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

      if (!row) {
        throw new Error("topic proposal insert returned no row");
      }

      return {
        id: row.id,
        candidateName: row.candidateName,
        status: row.status as TopicProposalStatus,
        createdAt: row.createdAt,
      };
    },

    async listActiveTopics() {
      const rows = await db
        .select({ id: topics.id, name: topics.name })
        .from(topics)
        .where(eq(topics.status, "active"));
      return rows;
    },

    async listPendingForSimilarity() {
      const rows = await db
        .select({
          id: topicProposals.id,
          candidateName: topicProposals.candidateName,
          status: topicProposals.status,
          createdAt: topicProposals.createdAt,
        })
        .from(topicProposals)
        .where(eq(topicProposals.status, "pending"));
      return rows.map((row) => ({
        id: row.id,
        candidateName: row.candidateName,
        status: row.status as TopicProposalStatus,
        createdAt: row.createdAt,
      }));
    },
  };
}
