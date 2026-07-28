import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  availabilityWindows,
  discoverabilityConsents,
  users,
  userTopics,
} from "../db/schema";

import type { DiscoverableUserRepository } from "./discoverable-user-repository";

export function createPostgresDiscoverableUserRepository(): DiscoverableUserRepository {
  return {
    async listDiscoverableUserIds(selectedTopicIds, options) {
      if (selectedTopicIds.length === 0) {
        return [];
      }

      const db = getDb();

      const rows = await db
        .select({ userId: userTopics.userId })
        .from(userTopics)
        .innerJoin(
          users,
          and(
            eq(users.id, userTopics.userId),
            eq(users.status, "active" as const),
            eq(userTopics.status, "active" as const),
          ),
        )
        .innerJoin(
          discoverabilityConsents,
          and(
            eq(discoverabilityConsents.userId, users.id),
            isNotNull(discoverabilityConsents.grantedAt),
          ),
        )
        .leftJoin(availabilityWindows, eq(availabilityWindows.userId, users.id))
        .where(
          and(
            inArray(userTopics.topicId, selectedTopicIds),
            options?.excludeUserId
              ? ne(userTopics.userId, options.excludeUserId)
              : undefined,
          ),
        )
        .groupBy(userTopics.userId)
        .having(
          options?.requireAllTopics
            ? sql`count(distinct ${userTopics.topicId}) = ${selectedTopicIds.length}`
            : undefined,
        )
        .orderBy(desc(sql`count(*)`));

      return rows.map((r) => r.userId);
    },
  };
}
