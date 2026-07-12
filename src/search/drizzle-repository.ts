import { desc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { searches } from "../db/schema";

import type { SearchRecord, SearchRepository } from "./repository";

export function createPostgresSearchRepository(): SearchRepository {
  return {
    async save(record) {
      const db = getDb();
      const values = {
        organizerId: record.organizerId,
        selectedTopicIds: record.selectedTopicIds,
        minimumMatchingUsers: record.minimumMatchingUsers,
        durationMinutes: record.durationMinutes,
        rangeStart: record.dateRangeStart,
        rangeEnd: record.dateRangeEnd,
        organizerTimezone: record.organizerTimezone,
        generatedAt: record.generatedAt,
      };
      if (record.id) {
        const [row] = await db
          .update(searches)
          .set({
            ...values,
            snapshotReference: record.snapshotReference ?? null,
          })
          .where(eq(searches.id, record.id))
          .returning();
        return toRecord(row);
      }
      const [row] = await db.insert(searches).values(values).returning();
      return toRecord(row);
    },
    async findById(id) {
      const [row] = await getDb()
        .select()
        .from(searches)
        .where(eq(searches.id, id))
        .limit(1);
      return row ? toRecord(row) : null;
    },
    async listByOrganizer(organizerId) {
      const rows = await getDb()
        .select()
        .from(searches)
        .where(eq(searches.organizerId, organizerId))
        .orderBy(desc(searches.generatedAt));
      return rows.map(toRecord);
    },
  };
}

type SearchRow = typeof searches.$inferSelect;

function toRecord(row: SearchRow): SearchRecord {
  return {
    id: row.id,
    organizerId: row.organizerId,
    selectedTopicIds: row.selectedTopicIds,
    minimumMatchingUsers: row.minimumMatchingUsers,
    durationMinutes: row.durationMinutes,
    dateRangeStart: row.rangeStart,
    dateRangeEnd: row.rangeEnd,
    organizerTimezone: row.organizerTimezone,
    generatedAt: row.generatedAt,
    snapshotReference: row.snapshotReference ?? undefined,
  };
}
