import { and, desc, eq, inArray, sql } from "drizzle-orm";

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
    async listDiscoverableUserIds(selectedTopicIds) {
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
          eq(discoverabilityConsents.userId, users.id),
        )
        .innerJoin(
          availabilityWindows,
          eq(availabilityWindows.userId, users.id),
        )
        .where(inArray(userTopics.topicId, selectedTopicIds))
        .groupBy(userTopics.userId)
        .orderBy(desc(sql`count(*)`));

      return rows.map((r) => r.userId);
    },
  };
}
