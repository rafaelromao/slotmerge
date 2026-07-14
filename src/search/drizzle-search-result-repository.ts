import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { searchResults } from "../db/schema";

import type {
  SearchResultRecord,
  SearchResultRepository,
} from "./search-result-repository";

export function createPostgresSearchResultRepository(): SearchResultRepository {
  return {
    async save(record) {
      const db = getDb();
      const [row] = await db
        .insert(searchResults)
        .values({
          searchId: record.searchId,
          snapshotJson: record.snapshotJson,
          createdAt: record.createdAt,
        })
        .returning();
      return toRecord(row);
    },
    async findById(id) {
      const [row] = await getDb()
        .select()
        .from(searchResults)
        .where(eq(searchResults.id, id))
        .limit(1);
      return row ? toRecord(row) : null;
    },
    async findBySearchId(searchId) {
      const [row] = await getDb()
        .select()
        .from(searchResults)
        .where(eq(searchResults.searchId, searchId))
        .limit(1);
      return row ? toRecord(row) : null;
    },
  };
}

type SearchResultRow = typeof searchResults.$inferSelect;

function toRecord(row: SearchResultRow): SearchResultRecord {
  return {
    id: row.id,
    searchId: row.searchId,
    snapshotJson: row.snapshotJson,
    createdAt: row.createdAt,
  };
}
