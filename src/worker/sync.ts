import { eq } from "drizzle-orm";
import { quickAddJob } from "graphile-worker";

import { ROLLING_WINDOW_DAYS } from "../calendar/imported-busy-intervals";
import { createPostgresImportedBusyIntervalRepository } from "../calendar/imported-busy-intervals.repository";
import { decryptCalendarToken } from "../calendar/token-encryption";
import {
  findCalendarConnectionById,
  getCalendarConnectionRepository,
} from "../calendar/repository";
import { getCalendarProvider } from "../calendar/providers";
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
import type { Clock } from "../system/clock";
import type { RandomSource } from "../system/random";

export const syncCalendarConnectionTaskName = "sync_calendar_connection";

export type HandleSyncCalendarConnectionJobDeps = {
  clock: Clock;
  randomSource: RandomSource;
};

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
  deps: HandleSyncCalendarConnectionJobDeps,
): Promise<void> {
  const { clock, randomSource } = deps;
  const job = parseSyncCalendarConnectionPayload(payload);

  const connection = await findCalendarConnectionById(job.connectionId);
  if (!connection) {
    return;
  }

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
        .where(eq(users.id, conn.userId))
        .limit(1);

      return {
        id: conn.id,
        userId: conn.userId,
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

  const now = clock.now();
  const timeMax = now.toISOString();
  const timeMin = new Date(
    now.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    await syncCalendarConnection({
      connectionId: connection.id,
      provider: getCalendarProvider(connection.provider),
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
      clock: () => clock.now(),
    });

    await updateLastSyncAt(connection.id, clock.now());
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ServerError) {
      const baseDelayMs =
        error.retryAfterMs ??
        getExponentialBackoffBase(error instanceof RateLimitError);
      const jitterMs = Math.floor(randomSource.next() * baseDelayMs);
      const delayMs = baseDelayMs + jitterMs;
      const nextRunAt = new Date(clock.now().getTime() + delayMs);
      await enqueueSyncCalendarConnectionJob(
        connection.id,
        config.databaseUrl,
        nextRunAt,
      );
      return;
    }
    throw error;
  }
}

async function updateLastSyncAt(connectionId: string, lastSyncAt: Date) {
  await getCalendarConnectionRepository().updateById(connectionId, {
    lastSyncAt,
  });
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
