import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections } from "../db/schema";
import type {
  CalendarConnectionRecord,
  CalendarConnectionRepository,
} from "./connection";

let repositoryOverride: CalendarConnectionRepository | null = null;

export function setCalendarConnectionRepositoryForTests(
  repository: CalendarConnectionRepository | null,
): void {
  repositoryOverride = repository;
}

export function getCalendarConnectionRepository(): CalendarConnectionRepository {
  return repositoryOverride ?? databaseCalendarConnectionRepository;
}

export async function findCalendarConnectionById(
  id: string,
): Promise<CalendarConnectionRecord | null> {
  return getCalendarConnectionRepository().findById(id);
}

export async function listActiveConnections(): Promise<
  CalendarConnectionRecord[]
> {
  return listActiveCalendarConnectionRecords();
}

export async function listActiveCalendarConnectionRecords(): Promise<
  CalendarConnectionRecord[]
> {
  const rows = await getDb()
    .select(calendarConnectionSelectColumns)
    .from(calendarConnections)
    .where(eq(calendarConnections.status, "connected"));

  return rows;
}

const calendarConnectionSelectColumns = {
  id: calendarConnections.id,
  userId: calendarConnections.userId,
  provider: calendarConnections.provider,
  providerAccountKey: calendarConnections.providerAccountKey,
  accountIdentifier: calendarConnections.accountIdentifier,
  scopes: calendarConnections.scopes,
  status: calendarConnections.status,
  refreshTokenEncrypted: calendarConnections.refreshTokenEncrypted,
  accessTokenEncrypted: calendarConnections.accessTokenEncrypted,
  accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
  lastErrorCode: calendarConnections.lastErrorCode,
  lastErrorMessage: calendarConnections.lastErrorMessage,
  lastSyncAt: calendarConnections.lastSyncAt,
  contributingCalendarIds: calendarConnections.contributingCalendarIds,
};

export const databaseCalendarConnectionRepository: CalendarConnectionRepository =
  {
    createPending: async (record) => {
      const [row] = await getDb()
        .insert(calendarConnections)
        .values({
          id: record.id,
          userId: record.userId,
          provider: record.provider,
          providerAccountKey: record.providerAccountKey,
          accountIdentifier: record.accountIdentifier,
          scopes: record.scopes,
          status: record.status,
          refreshTokenEncrypted: record.refreshTokenEncrypted,
          accessTokenEncrypted: record.accessTokenEncrypted,
          accessTokenExpiresAt: record.accessTokenExpiresAt,
          contributingCalendarIds: record.contributingCalendarIds,
        })
        .returning(calendarConnectionSelectColumns);

      return (row) ?? record;
    },
    listByUserId: async (userId) => {
      const rows = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, userId));

      return rows;
    },
    findById: async (id) => {
      const [row] = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(eq(calendarConnections.id, id))
        .limit(1);

      return (row) ?? null;
    },
    updateById: async (id, patch) => {
      const [row] = await getDb()
        .update(calendarConnections)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning(calendarConnectionSelectColumns);

      return (row) ?? null;
    },
  };
