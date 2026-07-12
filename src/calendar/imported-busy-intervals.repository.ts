import { and, eq, gte, lte } from "drizzle-orm";

import { getDb } from "../db/client";
import { importedBusyIntervals } from "../db/schema";

import type {
  ImportedBusyIntervalRecord,
  ImportedBusyIntervalRepository,
} from "./imported-busy-intervals";

export function createPostgresImportedBusyIntervalRepository(): ImportedBusyIntervalRepository {
  return {
    async upsertBatch(intervals) {
      if (intervals.length === 0) return;

      const db = getDb();

      await db.transaction(async (tx) => {
        const connectionIds = [...new Set(intervals.map((i) => i.connectionId))];
        for (const connectionId of connectionIds) {
          await tx.delete(importedBusyIntervals).where(
            eq(importedBusyIntervals.connectionId, connectionId),
          );
        }

        await tx.insert(importedBusyIntervals).values(
          intervals.map((interval) => ({
            id: interval.id,
            userId: interval.userId,
            connectionId: interval.connectionId,
            providerCalendarId: interval.providerCalendarId,
            providerEventReference: interval.providerEventReference,
            status: interval.status,
            startAt: interval.startAt,
            endAt: interval.endAt,
            importedAt: interval.importedAt,
          })),
        );
      });
    },

    async deleteByConnectionId(connectionId) {
      const db = getDb();
      await db
        .delete(importedBusyIntervals)
        .where(eq(importedBusyIntervals.connectionId, connectionId));
    },

    async findByUserIdAndDateRange(userId, start, end) {
      const rows = await getDb()
        .select()
        .from(importedBusyIntervals)
        .where(
          and(
            eq(importedBusyIntervals.userId, userId),
            gte(importedBusyIntervals.startAt, start),
            lte(importedBusyIntervals.startAt, end),
          ),
        );
      return rows.map(toRecord);
    },

    async deleteExpiredBefore(before) {
      const db = getDb();
      const deleted = await db
        .delete(importedBusyIntervals)
        .where(lte(importedBusyIntervals.startAt, before))
        .returning({ id: importedBusyIntervals.id });
      return deleted.length;
    },
  };
}

type ImportedBusyIntervalRow = typeof importedBusyIntervals.$inferSelect;

function toRecord(row: ImportedBusyIntervalRow): ImportedBusyIntervalRecord {
  return {
    id: row.id,
    userId: row.userId,
    connectionId: row.connectionId,
    providerCalendarId: row.providerCalendarId,
    providerEventReference: row.providerEventReference ?? null,
    status: row.status,
    startAt: row.startAt,
    endAt: row.endAt,
    importedAt: row.importedAt,
  };
}
