import type {
  ImportedBusyIntervalRecord,
  ImportedBusyIntervalRepository,
} from "./imported-busy-intervals";
import {
  fetchGoogleFreeBusy,
} from "./freebusy/google";
import {
  fetchMicrosoftFreeBusy,
} from "./freebusy/microsoft";
import {
  GoogleFreeBusyAuthError,
  GoogleFreeBusyRateLimitError,
  GoogleFreeBusyServerError,
  MicrosoftFreeBusyAuthError,
  MicrosoftFreeBusyRateLimitError,
  MicrosoftFreeBusyServerError,
} from "./freebusy/types";

export type SyncCalendarConnectionParams = {
  connectionId: string;
  provider: "google" | "microsoft";
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
    const intervals = await fetchBusyIntervals({
      provider,
      accessToken,
      calendarIds: contributingCalendarIds,
      timeMin,
      timeMax,
      fetchImpl,
    });

    const now = clock();

    const records: ImportedBusyIntervalRecord[] = intervals.map((interval) => ({
      id: `${connectionId}-${interval.providerCalendarId}-${interval.startAt.getTime()}`,
      userId,
      connectionId,
      providerCalendarId: interval.providerCalendarId,
      providerEventReference: null,
      status: interval.status,
      startAt: interval.startAt,
      endAt: interval.endAt,
      importedAt: now,
    }));

    await busyIntervalRepository.upsertBatch(records);
  } catch (error) {
    if (
      error instanceof GoogleFreeBusyAuthError ||
      error instanceof MicrosoftFreeBusyAuthError
    ) {
      await recordFailure({ code: "AUTH_ERROR", message: error.message });
      return;
    }

    if (
      error instanceof GoogleFreeBusyRateLimitError ||
      error instanceof MicrosoftFreeBusyRateLimitError
    ) {
      const retryAfterSeconds = error.retryAfterSeconds;
      throw new RateLimitError(
        retryAfterSeconds !== undefined
          ? retryAfterSeconds * 1000
          : undefined,
      );
    }

    if (
      error instanceof GoogleFreeBusyServerError ||
      error instanceof MicrosoftFreeBusyServerError
    ) {
      throw new ServerError(error.retryAfterSeconds !== undefined
        ? error.retryAfterSeconds * 1000
        : undefined);
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

async function fetchBusyIntervals(params: {
  provider: "google" | "microsoft";
  accessToken: string;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
  fetchImpl: typeof fetch;
}) {
  if (params.provider === "google") {
    return fetchGoogleFreeBusy({
      accessToken: params.accessToken,
      calendarIds: params.calendarIds,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      fetchImpl: params.fetchImpl,
    });
  } else {
    return fetchMicrosoftFreeBusy({
      accessToken: params.accessToken,
      calendarIds: params.calendarIds,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      fetchImpl: params.fetchImpl,
    });
  }
}
