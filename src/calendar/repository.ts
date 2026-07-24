import { and, eq, ne } from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections } from "../db/schema";
import type { Clock } from "../system/clock";
import { systemClock } from "../system/clock";
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

let cachedDefaultRepository: CalendarConnectionRepository | null = null;

function getDefaultRepository(): CalendarConnectionRepository {
  if (!cachedDefaultRepository) {
    cachedDefaultRepository =
      createPostgresCalendarConnectionRepository(systemClock());
  }
  return cachedDefaultRepository;
}

export function getCalendarConnectionRepository(): CalendarConnectionRepository {
  return repositoryOverride ?? getDefaultRepository();
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

export function createPostgresCalendarConnectionRepository(
  clock: Clock,
): CalendarConnectionRepository {
  return {
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

      return row ?? record;
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

      return row ?? null;
    },
    updateById: async (id, patch) => {
      const [row] = await getDb()
        .update(calendarConnections)
        .set({
          ...patch,
          updatedAt: clock.now(),
        })
        .where(eq(calendarConnections.id, id))
        .returning(calendarConnectionSelectColumns);

      return row ?? null;
    },
    replaceWithPending: async ({ previousId, userId, provider, pending }) =>
      getDb().transaction(async (tx) => {
        const [previous] = await tx
          .update(calendarConnections)
          .set({
            status: "disconnected",
            refreshTokenEncrypted: null,
            accessTokenEncrypted: null,
            accessTokenExpiresAt: null,
            updatedAt: clock.now(),
          })
          .where(
            and(
              eq(calendarConnections.id, previousId),
              eq(calendarConnections.userId, userId),
              eq(calendarConnections.provider, provider),
              ne(calendarConnections.status, "pending"),
              ne(calendarConnections.status, "disconnected"),
            ),
          )
          .returning({ id: calendarConnections.id });

        if (!previous) {
          throw new Error("Calendar Connection cannot be replaced");
        }

        const [row] = await tx
          .insert(calendarConnections)
          .values({
            id: pending.id,
            userId: pending.userId,
            provider: pending.provider,
            providerAccountKey: pending.providerAccountKey,
            accountIdentifier: pending.accountIdentifier,
            scopes: pending.scopes,
            status: pending.status,
            refreshTokenEncrypted: pending.refreshTokenEncrypted,
            accessTokenEncrypted: pending.accessTokenEncrypted,
            accessTokenExpiresAt: pending.accessTokenExpiresAt,
            contributingCalendarIds: pending.contributingCalendarIds,
          })
          .returning(calendarConnectionSelectColumns);

        if (!row) {
          throw new Error("Replacement Calendar Connection was not created");
        }

        return row;
      }),
    claimPending: async ({ id, userId, provider }) => {
      const [row] = await getDb()
        .update(calendarConnections)
        .set({
          updatedAt: clock.now(),
        })
        .where(
          and(
            eq(calendarConnections.id, id),
            eq(calendarConnections.userId, userId),
            eq(calendarConnections.provider, provider),
            eq(calendarConnections.status, "pending"),
          ),
        )
        .returning(calendarConnectionSelectColumns);

      return row ?? null;
    },
  };
}
