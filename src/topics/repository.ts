import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  topics,
  userTopics,
  type TopicAssociationStatus,
  type TopicStatus,
} from "../db/schema";

export type TopicCatalogueEntry = {
  id: string;
  name: string;
  status: TopicStatus;
};

export type AdminTopicListItem = {
  id: string;
  name: string;
  status: TopicStatus;
  retiredAt: Date | null;
  createdAt: Date;
};

export type RetireResult =
  { ok: true } | { ok: false; reason: "not_found" | "already_retired" };

export type TopicAssociation = {
  topicId: string;
  status: TopicAssociationStatus;
};

export type TopicCatalogueRepository = {
  listCatalogue(): Promise<TopicCatalogueEntry[]>;
  listSelectedTopicIds(userId: string): Promise<string[]>;
  listAssociations(userId: string): Promise<TopicAssociation[]>;
  saveAssociations(input: {
    userId: string;
    associations: TopicAssociation[];
    now: Date;
  }): Promise<void>;
  listActiveAdminTopics(): Promise<AdminTopicListItem[]>;
  retire(input: { id: string; now: Date }): Promise<RetireResult>;
};

let repositoryOverride: TopicCatalogueRepository | null = null;
let cachedDatabaseTopicCatalogueRepository: TopicCatalogueRepository | null =
  null;

export function setTopicCatalogueRepositoryForTests(
  repository: TopicCatalogueRepository | null,
) {
  repositoryOverride = repository;
  cachedDatabaseTopicCatalogueRepository = null;
}

export function getTopicCatalogueRepository(): TopicCatalogueRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (!cachedDatabaseTopicCatalogueRepository) {
    cachedDatabaseTopicCatalogueRepository =
      createPostgresTopicCatalogueRepository();
  }

  return cachedDatabaseTopicCatalogueRepository;
}

export async function listActiveTopics(): Promise<TopicCatalogueEntry[]> {
  const catalogue = await getTopicCatalogueRepository().listCatalogue();

  return catalogue.filter((topic) => topic.status === "active");
}

export async function getTopicPageState(userId: string | null) {
  const catalogue = await listActiveTopics();
  const selectedTopicIds = userId
    ? await getTopicCatalogueRepository().listSelectedTopicIds(userId)
    : [];

  return { catalogue, selectedTopicIds };
}

export async function replaceUserTopics(input: {
  userId: string;
  topicIds: string[];
  now: Date;
}): Promise<void> {
  const repository = getTopicCatalogueRepository();
  const catalogue = await repository.listCatalogue();
  const existingAssociations = await repository.listAssociations(input.userId);

  await repository.saveAssociations({
    userId: input.userId,
    associations: deriveUserTopicAssociations({
      catalogue,
      existingAssociations,
      selectedTopicIds: input.topicIds,
    }),
    now: input.now,
  });
}

export function deriveUserTopicAssociations({
  catalogue,
  existingAssociations,
  selectedTopicIds,
}: {
  catalogue: TopicCatalogueEntry[];
  existingAssociations: TopicAssociation[];
  selectedTopicIds: string[];
}): TopicAssociation[] {
  const existingByTopicId = new Map(
    existingAssociations.map((association) => [
      association.topicId,
      association,
    ]),
  );
  const selectedIds = new Set(selectedTopicIds);
  const nextAssociations: TopicAssociation[] = [];

  for (const topic of catalogue) {
    const existing = existingByTopicId.get(topic.id);

    if (topic.status === "active") {
      if (selectedIds.has(topic.id)) {
        nextAssociations.push({ topicId: topic.id, status: "active" });
      } else if (existing) {
        nextAssociations.push({ topicId: topic.id, status: "historical" });
      }

      continue;
    }

    if (existing) {
      nextAssociations.push({
        topicId: topic.id,
        status:
          existing.status === "historical" ? "historical" : "pending-retired",
      });
    }
  }

  for (const existing of existingAssociations) {
    if (catalogue.some((topic) => topic.id === existing.topicId)) {
      continue;
    }

    nextAssociations.push(existing);
  }

  return nextAssociations;
}

export async function saveUserTopicSelection(input: {
  userId: string;
  topicIds: string[];
  now: Date;
}): Promise<void> {
  const activeTopicIds = new Set(
    (await listActiveTopics()).map((topic) => topic.id),
  );

  await replaceUserTopics({
    userId: input.userId,
    topicIds: input.topicIds.filter((topicId) => activeTopicIds.has(topicId)),
    now: input.now,
  });
}

export function createPostgresTopicCatalogueRepository(
  db = getDb(),
): TopicCatalogueRepository {
  return {
    listCatalogue: async () => db.select().from(topics).orderBy(topics.name),
    listSelectedTopicIds: async (userId) =>
      (
        await db
          .select({ topicId: userTopics.topicId })
          .from(userTopics)
          .where(
            and(eq(userTopics.userId, userId), eq(userTopics.status, "active")),
          )
          .orderBy(userTopics.createdAt)
      ).map((row) => row.topicId),
    listAssociations: async (userId) =>
      db
        .select({ topicId: userTopics.topicId, status: userTopics.status })
        .from(userTopics)
        .where(eq(userTopics.userId, userId))
        .orderBy(userTopics.createdAt),
    saveAssociations: async ({ userId, associations, now }) => {
      if (associations.length === 0) {
        return;
      }

      await db
        .insert(userTopics)
        .values(
          associations.map((association) => ({
            userId,
            topicId: association.topicId,
            status: association.status,
            updatedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [userTopics.userId, userTopics.topicId],
          set: {
            status: sql`excluded.status`,
            updatedAt: now,
          },
        });
    },
    listActiveAdminTopics: async () =>
      db
        .select({
          id: topics.id,
          name: topics.name,
          status: topics.status,
          retiredAt: topics.retiredAt,
          createdAt: topics.createdAt,
        })
        .from(topics)
        .where(eq(topics.status, "active"))
        .orderBy(desc(topics.createdAt)),
    retire: async ({ id, now }) => {
      const [topic] = await db
        .select({ status: topics.status })
        .from(topics)
        .where(eq(topics.id, id))
        .limit(1);

      if (!topic) {
        return { ok: false, reason: "not_found" };
      }

      if (topic.status === "retired") {
        return { ok: false, reason: "already_retired" };
      }

      await db
        .update(topics)
        .set({ status: "retired", retiredAt: now, updatedAt: now })
        .where(eq(topics.id, id));

      return { ok: true };
    },
  };
}
