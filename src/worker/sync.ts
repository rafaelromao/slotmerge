import { eq } from "drizzle-orm";
import { quickAddJob } from "graphile-worker";

import { ROLLING_WINDOW_DAYS } from "../calendar/imported-busy-intervals";
import { createPostgresImportedBusyIntervalRepository } from "../calendar/imported-busy-intervals.repository";
import { decryptCalendarToken } from "../calendar/token-encryption";
import {
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "../calendar/repository";
import {
  syncCalendarConnection,
  RateLimitError,
  ServerError,
} from "../calendar/sync";
import {
  recordCalendarConnectionSyncFailure,
  type CalendarConnectionUserLookup,
} from "../calendar/sync-failure-recorder";
import { loadRuntimeConfig } from "../config/runtime";
import { getDb } from "../db/client";
import { users } from "../db/schema";

export const syncCalendarConnectionTaskName = "sync_calendar_connection";

export async function enqueueSyncCalendarConnectionJob(
  connectionId: string,
  databaseUrl: string,
  runAt?: Date,
): Promise<void> {
  await quickAddJob(
    { connectionString: databaseUrl },
    syncCalendarConnectionTaskName,
    { connectionId },
    { runAt },
  );
}

export async function handleSyncCalendarConnectionJob(
  payload: unknown,
): Promise<void> {
  const job = parseSyncCalendarConnectionPayload(payload);

  const found = await findCalendarConnectionById(job.connectionId);
  if (!found) {
    return;
  }

  const { record: connection } = found;

  if (connection.status !== "connected") {
    return;
  }

  const config = loadRuntimeConfig();
  const tokenEncryptionKey = config.calendarTokenEncryptionKey;

  const accessToken = decryptCalendarToken({
    ciphertext: connection.accessTokenEncrypted ?? "",
    key: tokenEncryptionKey,
  });

  const busyIntervalRepository = createPostgresImportedBusyIntervalRepository();

  const connectionLookup: CalendarConnectionUserLookup = async (connId) => {
    const conn = await findCalendarConnectionById(connId);
    if (!conn) return null;

    const [user] = await getDb()
      .select({ email: users.email, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, conn.record.userId))
      .limit(1);

    return {
      id: conn.record.id,
      userId: conn.record.userId,
      provider: conn.provider,
      user: {
        email: user?.email ?? "",
        displayName: user?.displayName ?? null,
      },
    };
  };

  const now = new Date();
  const timeMax = now.toISOString();
  const timeMin = new Date(
    now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    await syncCalendarConnection({
      connectionId: connection.id,
      provider: connection.provider,
      accessToken,
      contributingCalendarIds: connection.contributingCalendarIds,
      userId: connection.userId,
      timeMin,
      timeMax,
      fetchImpl: fetch,
      busyIntervalRepository,
      recordFailure: (input) =>
        recordCalendarConnectionSyncFailure(
          {
            connectionId: connection.id,
            provider: connection.provider,
            code: input.code,
            message: input.message,
          },
          { connectionLookup },
        ),
      clock: () => new Date(),
    });

    await updateLastSyncAt(connection.id, new Date());
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ServerError) {
      const baseDelayMs = error.retryAfterMs ?? getExponentialBackoffBase(error instanceof RateLimitError);
      const jitterMs = Math.floor(Math.random() * baseDelayMs);
      const delayMs = baseDelayMs + jitterMs;
      await enqueueSyncCalendarConnectionJob(
        connection.id,
        config.databaseUrl,
        new Date(Date.now() + delayMs),
      );
      return;
    }
    throw error;
  }
}

async function updateLastSyncAt(connectionId: string, lastSyncAt: Date) {
  const googleRepo = getGoogleCalendarConnectionRepository();
  const microsoftRepo = getMicrosoftCalendarConnectionRepository();

  const googleRecord = await googleRepo.findById(connectionId);
  if (googleRecord) {
    await googleRepo.updateById(connectionId, { lastSyncAt });
    return;
  }

  const microsoftRecord = await microsoftRepo.findById(connectionId);
  if (microsoftRecord) {
    await microsoftRepo.updateById(connectionId, { lastSyncAt });
  }
}

function getExponentialBackoffBase(isRateLimit: boolean): number {
  return isRateLimit ? 30_000 : 60_000;
}

type SyncCalendarConnectionPayload = {
  connectionId: string;
};

function parseSyncCalendarConnectionPayload(
  payload: unknown,
): SyncCalendarConnectionPayload {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "connectionId" in payload &&
    typeof (payload as Record<string, unknown>).connectionId === "string"
  ) {
    return {
      connectionId: (payload as SyncCalendarConnectionPayload).connectionId,
    };
  }
  throw new Error(
    "sync_calendar_connection job requires a connectionId payload",
  );
}

async function findCalendarConnectionById(id: string) {
  const googleRepo = getGoogleCalendarConnectionRepository();
  const googleRecord = await googleRepo.findById(id);
  if (googleRecord) {
    return { provider: "google" as const, record: googleRecord };
  }

  const microsoftRepo = getMicrosoftCalendarConnectionRepository();
  const microsoftRecord = await microsoftRepo.findById(id);
  if (microsoftRecord) {
    return { provider: "microsoft" as const, record: microsoftRecord };
  }

  return null;
}
