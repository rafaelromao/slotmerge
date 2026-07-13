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
  RATE_LIMIT_BASE_MS,
  SERVER_ERROR_BASE_MS,
} from "../calendar/freebusy/types";
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

  let accessToken: string;
  let connectionLookup: CalendarConnectionUserLookup;

  try {
    accessToken = decryptCalendarToken({
      ciphertext: connection.accessTokenEncrypted ?? "",
      key: tokenEncryptionKey,
    });

    connectionLookup = async (connId) => {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCalendarConnectionSyncFailure(
      {
        connectionId: connection.id,
        provider: connection.provider,
        code: "SYNC_ERROR",
        message,
      },
      { connectionLookup: () => Promise.resolve(null) },
    );
    throw error;
  }

  const busyIntervalRepository = createPostgresImportedBusyIntervalRepository();

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

    await updateLastSyncAt(connection.id, connection.provider, new Date());
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ServerError) {
      // NOTE: Uses constant + jitter backoff (not exponential) per MVP spec trade-off.
      const baseDelayMs =
        error.retryAfterMs ??
        getExponentialBackoffBase(error instanceof RateLimitError);
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

async function updateLastSyncAt(
  connectionId: string,
  provider: "google" | "microsoft",
  lastSyncAt: Date,
) {
  if (provider === "google") {
    await getGoogleCalendarConnectionRepository().updateById(connectionId, {
      lastSyncAt,
    });
  } else {
    await getMicrosoftCalendarConnectionRepository().updateById(connectionId, {
      lastSyncAt,
    });
  }
}

function getExponentialBackoffBase(isRateLimit: boolean): number {
  return isRateLimit ? RATE_LIMIT_BASE_MS : SERVER_ERROR_BASE_MS;
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
