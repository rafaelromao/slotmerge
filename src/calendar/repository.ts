import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections } from "../db/schema";
import { type GoogleCalendarConnectionRepository } from "./google-calendar-connections";
import { type MicrosoftCalendarConnectionRepository } from "./microsoft-calendar-connections";

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
  return (
    googleRepositoryOverride ?? databaseGoogleCalendarConnectionRepository
  );
}

export function getMicrosoftCalendarConnectionRepository(): MicrosoftCalendarConnectionRepository {
  return (
    microsoftRepositoryOverride ?? databaseMicrosoftCalendarConnectionRepository
  );
}

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
        })
        .returning({
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
        });

      return row ?? record;
    },
    listByUserId: async (userId) => {
      return getDb()
        .select({
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
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, userId));
    },
    findById: async (id) => {
      const [row] = await getDb()
        .select({
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
        })
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
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning({
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
        });

      return row ?? null;
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
        })
        .returning({
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
        });

      return row ?? record;
    },
    listByUserId: async (userId) => {
      return getDb()
        .select({
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
        })
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, userId));
    },
    findById: async (id) => {
      const [row] = await getDb()
        .select({
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
        })
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
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, id))
        .returning({
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
        });

      return row ?? null;
    },
  };
