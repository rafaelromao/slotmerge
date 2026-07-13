import { desc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { searches, searchResults } from "../db/schema";

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
        snapshotReference: record.snapshotReference ?? null,
      };
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
    async listSearchHistory() {
      const rows = await getDb()
        .select({
          id: searches.id,
          organizerId: searches.organizerId,
          selectedTopicIds: searches.selectedTopicIds,
          minimumMatchingUsers: searches.minimumMatchingUsers,
          durationMinutes: searches.durationMinutes,
          dateRangeStart: searches.rangeStart,
          dateRangeEnd: searches.rangeEnd,
          organizerTimezone: searches.organizerTimezone,
          generatedAt: searches.generatedAt,
          snapshotId: searchResults.id,
        })
        .from(searches)
        .leftJoin(searchResults, eq(searches.id, searchResults.searchId))
        .orderBy(desc(searches.generatedAt));

      return rows
        .filter((row): row is typeof row & { snapshotId: string } => row.snapshotId != null)
        .map((row) => ({
          id: row.id,
          organizerId: row.organizerId,
          selectedTopicIds: row.selectedTopicIds,
          minimumMatchingUsers: row.minimumMatchingUsers,
          durationMinutes: row.durationMinutes,
          dateRangeStart: row.dateRangeStart,
          dateRangeEnd: row.dateRangeEnd,
          organizerTimezone: row.organizerTimezone,
          generatedAt: row.generatedAt,
          snapshotId: row.snapshotId,
        }));
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
