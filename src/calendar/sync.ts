import { randomUUID } from "node:crypto";

import type {
  ImportedBusyIntervalRecord,
  ImportedBusyIntervalRepository,
} from "./imported-busy-intervals";
import {
  FreeBusyAuthError,
  FreeBusyRateLimitError,
  FreeBusyServerError,
} from "./freebusy/types";
import type { CalendarProvider } from "./provider";

export type SyncCalendarConnectionParams = {
  connectionId: string;
  provider: CalendarProvider;
  accessToken: string;
  contributingCalendarIds: string[];
  userId: string;
  timeMin: string;
  timeMax: string;
  fetchImpl: typeof fetch;
  busyIntervalRepository: ImportedBusyIntervalRepository;
  recordFailure: (input: { code: string; message: string }) => Promise<unknown>;
  clock: () => Date;
};

export async function syncCalendarConnection(
  params: SyncCalendarConnectionParams,
): Promise<void> {
  const {
    connectionId,
    userId,
    contributingCalendarIds,
    timeMin,
    timeMax,
    busyIntervalRepository,
    recordFailure,
    clock,
    provider,
    accessToken,
    fetchImpl,
  } = params;

  if (contributingCalendarIds.length === 0) {
    return;
  }

  try {
    const intervals = await provider.fetchFreeBusy({
      accessToken,
      calendarIds: contributingCalendarIds,
      timeMin,
      timeMax,
      fetchImpl,
    });

    const now = clock();

    const records: ImportedBusyIntervalRecord[] = intervals.map((interval) => {
      return {
        id: randomUUID(),
        userId,
        connectionId,
        providerCalendarId: interval.providerCalendarId,
        providerEventReference: interval.eventId ?? null,
        status: interval.status,
        startAt: interval.startAt,
        endAt: interval.endAt,
        importedAt: now,
      };
    });

    await busyIntervalRepository.upsertBatch(records);
  } catch (error) {
    if (error instanceof FreeBusyAuthError) {
      await recordFailure({ code: "AUTH_ERROR", message: error.message });
      return;
    }

    if (error instanceof FreeBusyRateLimitError) {
      const retryAfterSeconds = error.retryAfterSeconds;
      throw new RateLimitError(
        retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : undefined,
      );
    }

    if (error instanceof FreeBusyServerError) {
      throw new ServerError(
        error.retryAfterSeconds !== undefined
          ? error.retryAfterSeconds * 1000
          : undefined,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    await recordFailure({ code: "SYNC_ERROR", message });
  }
}

export class RateLimitError extends Error {
  readonly retryAfterMs: number | undefined;
  constructor(retryAfterMs: number | undefined) {
    super(
      retryAfterMs !== undefined
        ? `Rate limited, retry after ${retryAfterMs}ms`
        : "Rate limited",
    );
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class ServerError extends Error {
  readonly retryAfterMs: number | undefined;
  constructor(retryAfterMs: number | undefined) {
    super(
      retryAfterMs !== undefined
        ? `Server error, retry after ${retryAfterMs}ms`
        : "Server error",
    );
    this.name = "ServerError";
    this.retryAfterMs = retryAfterMs;
  }
}
