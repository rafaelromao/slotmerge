import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections } from "../db/schema";
import {
  type GoogleCalendarConnectionRecord,
  type GoogleCalendarConnectionRepository,
} from "./google-calendar-connections";
import {
  type MicrosoftCalendarConnectionRecord,
  type MicrosoftCalendarConnectionRepository,
} from "./microsoft-calendar-connections";

let googleRepositoryOverride: GoogleCalendarConnectionRepository | null = null;
let microsoftRepositoryOverride: MicrosoftCalendarConnectionRepository | null =
  null;

export function setGoogleCalendarConnectionRepositoryForTests(
  repository: GoogleCalendarConnectionRepository | null,
) {
  googleRepositoryOverride = repository;
}

export function setMicrosoftCalendarConnectionRepositoryForTests(
  repository: MicrosoftCalendarConnectionRepository | null,
) {
  microsoftRepositoryOverride = repository;
}

export function getGoogleCalendarConnectionRepository(): GoogleCalendarConnectionRepository {
  return googleRepositoryOverride ?? databaseGoogleCalendarConnectionRepository;
}

export function getMicrosoftCalendarConnectionRepository(): MicrosoftCalendarConnectionRepository {
  return (
    microsoftRepositoryOverride ?? databaseMicrosoftCalendarConnectionRepository
  );
}

export async function findCalendarConnectionById(
  id: string,
): Promise<
  | { provider: "google"; record: GoogleCalendarConnectionRecord }
  | { provider: "microsoft"; record: MicrosoftCalendarConnectionRecord }
  | null
> {
  const googleRepository = getGoogleCalendarConnectionRepository();
  const googleRecord = await googleRepository.findById(id);
  if (googleRecord) {
    return { provider: "google", record: googleRecord };
  }

  const microsoftRepository = getMicrosoftCalendarConnectionRepository();
  const microsoftRecord = await microsoftRepository.findById(id);
  if (microsoftRecord) {
    return { provider: "microsoft", record: microsoftRecord };
  }

  return null;
}

export type ActiveCalendarConnection =
  | { provider: "google"; record: GoogleCalendarConnectionRecord }
  | { provider: "microsoft"; record: MicrosoftCalendarConnectionRecord };

export async function listActiveConnections(): Promise<
  ActiveCalendarConnection[]
> {
  const rows = await getDb()
    .select(calendarConnectionSelectColumns)
    .from(calendarConnections)
    .where(eq(calendarConnections.status, "connected"));

  return rows.map((row) => {
    if (row.provider === "google") {
      return {
        provider: "google" as const,
        record: row as GoogleCalendarConnectionRecord,
      };
    }
    return {
      provider: "microsoft" as const,
      record: row as MicrosoftCalendarConnectionRecord,
    };
  });
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

export const databaseGoogleCalendarConnectionRepository: GoogleCalendarConnectionRepository =
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

      return (row as GoogleCalendarConnectionRecord | undefined) ?? record;
    },
    listByUserId: async (userId) => {
      const rows = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, userId),
            eq(calendarConnections.provider, "google"),
          ),
        );

      return rows as GoogleCalendarConnectionRecord[];
    },
    findById: async (id) => {
      const [row] = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.id, id),
            eq(calendarConnections.provider, "google"),
          ),
        )
        .limit(1);

      return (row as GoogleCalendarConnectionRecord | undefined) ?? null;
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

      return (row as GoogleCalendarConnectionRecord | undefined) ?? null;
    },
  };

export const databaseMicrosoftCalendarConnectionRepository: MicrosoftCalendarConnectionRepository =
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

      return (row as MicrosoftCalendarConnectionRecord | undefined) ?? record;
    },
    listByUserId: async (userId) => {
      const rows = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.userId, userId),
            eq(calendarConnections.provider, "microsoft"),
          ),
        );

      return rows as MicrosoftCalendarConnectionRecord[];
    },
    findById: async (id) => {
      const [row] = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.id, id),
            eq(calendarConnections.provider, "microsoft"),
          ),
        )
        .limit(1);

      return (row as MicrosoftCalendarConnectionRecord | undefined) ?? null;
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

      return (row as MicrosoftCalendarConnectionRecord | undefined) ?? null;
    },
  };
