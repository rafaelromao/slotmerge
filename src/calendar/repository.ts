import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections } from "../db/schema";
import type {
  CalendarConnectionRecord,
  CalendarConnectionRepository,
} from "./connection";
import type {
  GoogleCalendarConnectionRecord,
  GoogleCalendarConnectionRepository,
} from "./google-calendar-connections";
import type {
  MicrosoftCalendarConnectionRecord,
  MicrosoftCalendarConnectionRepository,
} from "./microsoft-calendar-connections";

let repositoryOverride: CalendarConnectionRepository | null = null;
let googleRepositoryOverride: GoogleCalendarConnectionRepository | null = null;
let microsoftRepositoryOverride: MicrosoftCalendarConnectionRepository | null =
  null;

export function setCalendarConnectionRepositoryForTests(
  repository: CalendarConnectionRepository | null,
): void {
  repositoryOverride = repository;
}

export function getCalendarConnectionRepository(): CalendarConnectionRepository {
  if (repositoryOverride) return repositoryOverride;
  if (googleRepositoryOverride || microsoftRepositoryOverride) {
    return legacyCalendarConnectionRepository;
  }
  return databaseCalendarConnectionRepository;
}

export function setGoogleCalendarConnectionRepositoryForTests(
  repository: GoogleCalendarConnectionRepository | null,
): void {
  googleRepositoryOverride = repository;
}

export function setMicrosoftCalendarConnectionRepositoryForTests(
  repository: MicrosoftCalendarConnectionRepository | null,
): void {
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

const legacyCalendarConnectionRepository: CalendarConnectionRepository = {
  createPending: (record) =>
    record.provider === "google"
      ? getGoogleCalendarConnectionRepository().createPending(record)
      : getMicrosoftCalendarConnectionRepository().createPending(record),
  listByUserId: async (userId) => {
    const [googleRecords, microsoftRecords] = await Promise.all([
      getGoogleCalendarConnectionRepository().listByUserId(userId),
      getMicrosoftCalendarConnectionRepository().listByUserId(userId),
    ]);
    return [...googleRecords, ...microsoftRecords];
  },
  findById: async (id) => {
    const googleRecord =
      await getGoogleCalendarConnectionRepository().findById(id);
    if (googleRecord) return googleRecord;
    return getMicrosoftCalendarConnectionRepository().findById(id);
  },
  updateById: async (id, patch) => {
    const googleRecord =
      await getGoogleCalendarConnectionRepository().findById(id);
    return googleRecord
      ? getGoogleCalendarConnectionRepository().updateById(id, patch)
      : getMicrosoftCalendarConnectionRepository().updateById(id, patch);
  },
};

export async function findCalendarConnectionRecordById(
  id: string,
): Promise<CalendarConnectionRecord | null> {
  return getCalendarConnectionRepository().findById(id);
}

export async function findCalendarConnectionById(
  id: string,
): Promise<
  | { provider: "google"; record: GoogleCalendarConnectionRecord }
  | { provider: "microsoft"; record: MicrosoftCalendarConnectionRecord }
  | null
> {
  const googleRecord =
    await getGoogleCalendarConnectionRepository().findById(id);
  if (googleRecord) {
    return { provider: "google", record: googleRecord };
  }

  const microsoftRecord =
    await getMicrosoftCalendarConnectionRepository().findById(id);
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
  const records = await listActiveCalendarConnectionRecords();
  return records.map((record) =>
    record.provider === "google"
      ? { provider: "google", record }
      : { provider: "microsoft", record },
  );
}

export async function listActiveCalendarConnectionRecords(): Promise<
  CalendarConnectionRecord[]
> {
  const rows = await getDb()
    .select(calendarConnectionSelectColumns)
    .from(calendarConnections)
    .where(eq(calendarConnections.status, "connected"));

  return rows as CalendarConnectionRecord[];
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

      return (row as CalendarConnectionRecord | undefined) ?? record;
    },
    listByUserId: async (userId) => {
      const rows = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, userId));

      return rows as CalendarConnectionRecord[];
    },
    findById: async (id) => {
      const [row] = await getDb()
        .select(calendarConnectionSelectColumns)
        .from(calendarConnections)
        .where(eq(calendarConnections.id, id))
        .limit(1);

      return (row as CalendarConnectionRecord | undefined) ?? null;
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

      return (row as CalendarConnectionRecord | undefined) ?? null;
    },
  };

export const databaseGoogleCalendarConnectionRepository =
  databaseCalendarConnectionRepository as GoogleCalendarConnectionRepository;
export const databaseMicrosoftCalendarConnectionRepository =
  databaseCalendarConnectionRepository as MicrosoftCalendarConnectionRepository;
