"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { CsrfError } from "../../../../src/lib/csrf";
import { getDb } from "../../../../src/db/client";
import { createPostgresTopicProposalRepository } from "../../../../src/topics/proposals.repository";
import { createTopicProposalRouteRepository } from "../../../../src/topics/proposals-route";
import {
  setTopicCatalogueRepositoryForTests,
  type TopicCatalogueRepository,
} from "../../../../src/topics/repository";
import {
  createTopicWorkflow,
  type TopicRow,
  type TopicProposalRow,
} from "../../../../src/topics/topic-workflow";
import {
  createTopicsActionHandler,
  type ProposeActionState,
} from "../../../../src/topics/topics-action";
import { systemClock } from "../../../../src/system/clock";

async function buildWorkflow() {
  const db = getDb();
  const { topics, userTopics, topicProposals } =
    await import("../../../../src/db/schema");
  const { and, asc, eq } = await import("drizzle-orm");

  const catalogue: TopicCatalogueRepository & {
    listActive: () => Promise<TopicRow[]>;
    listSelectedTopicIds: (userId: string) => Promise<string[]>;
  } = {
    async listCatalogue() {
      const rows = await db
        .select({
          id: topics.id,
          name: topics.name,
          status: topics.status,
        })
        .from(topics)
        .orderBy(topics.name);
      return rows;
    },
    async listActive() {
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
    async listAssociations(userId) {
      const rows = await db
        .select({ topicId: userTopics.topicId, status: userTopics.status })
        .from(userTopics)
        .where(eq(userTopics.userId, userId))
        .orderBy(userTopics.createdAt);
      return rows;
    },
    saveAssociations() {
      throw new Error(
        "saveAssociations is unused by the T6 workflow; replaceUserTopics owns the write path",
      );
    },
  };

  const proposalsRepo = {
    listUserProposals: async (userId: string): Promise<TopicProposalRow[]> => {
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
  };

  return createTopicWorkflow({
    catalogue,
    proposals: proposalsRepo,
    clock: systemClock(),
    createProposal: async (userId, candidateName, now) => {
      const { createTopicProposal } =
        await import("../../../../src/topics/proposals");
      return createTopicProposal(
        userId,
        candidateName,
        now,
        createTopicProposalRouteRepository(
          createPostgresTopicProposalRepository(),
        ),
      );
    },
  });
}

async function loadSession(request: Request) {
  return getSessionFromRequest(request);
}

async function buildTopicsRequest(url: string): Promise<Request> {
  const headerList = await headers();
  const headersObject: Record<string, string> = {};
  headerList.forEach((value, key) => {
    headersObject[key] = value;
  });
  return new Request(url, {
    method: "POST",
    headers: headersObject,
  });
}

export async function saveTopicSelectionAction(
  formData: FormData,
): Promise<never> {
  const workflow = await buildWorkflow();
  const handler = createTopicsActionHandler({
    workflow,
    loadSession,
  });

  const request = await buildTopicsRequest("http://localhost/me/topics");
  const result = await handler.saveSelection({ formData, request });

  if (result.kind === "csrf-error") {
    throw new CsrfError();
  }
  if (result.kind === "redirect" || result.kind === "redirect-to-saved") {
    redirect(result.to);
  }

  if (result.kind === "form-error") {
    const params = new URLSearchParams({
      topicsError: result.code,
      ...(result.invalidIds.length > 0
        ? { topicsInvalidIds: result.invalidIds.join(",") }
        : {}),
    });
    redirect(`/me/topics?${params.toString()}`);
  }

  redirect("/me/topics");
}

export async function proposeTopicAction(
  _prev: ProposeActionState,
  formData: FormData,
): Promise<ProposeActionState> {
  const workflow = await buildWorkflow();
  const handler = createTopicsActionHandler({
    workflow,
    loadSession,
  });

  const request = await buildTopicsRequest("http://localhost/me/topics");
  return handler.propose({ formData, request });
}

export type ProposeActionStateLazy = ProposeActionState;

export function __resetTopicCatalogueRepositoryForTests(): void {
  setTopicCatalogueRepositoryForTests(null);
}
