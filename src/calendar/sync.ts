import { calculateCalendarSyncRetryDelay } from "./sync-policy";
import type {
  ImportedBusyIntervalRepository,
  ImportedBusyIntervalRecord,
} from "./imported-busy-intervals";
import type {
  GoogleCalendarConnectionRepository,
  GoogleCalendarConnectionRecord,
} from "./google-calendar-connections";
import type {
  MicrosoftCalendarConnectionRepository,
  MicrosoftCalendarConnectionRecord,
} from "./microsoft-calendar-connections";

export type CalendarConnectionSyncRecord = {
  id: string;
  userId: string;
  provider:
    | GoogleCalendarConnectionRecord["provider"]
    | MicrosoftCalendarConnectionRecord["provider"];
  status:
    | GoogleCalendarConnectionRecord["status"]
    | MicrosoftCalendarConnectionRecord["status"];
  contributingCalendarIds: string[];
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  accessTokenEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  accessTokenExpiresAt?: Date | null;
};

export type CalendarSyncConnectionRepository =
  GoogleCalendarConnectionRepository | MicrosoftCalendarConnectionRepository;

export type CalendarSyncProviderClient = {
  fetchImportedBusyIntervals(input: {
    connection: CalendarConnectionSyncRecord;
    now: Date;
    attempt: number;
  }): Promise<ImportedBusyIntervalRecord[]>;
};

export type CalendarSyncRetryScheduler = (input: {
  connectionId: string;
  attempt: number;
  delayMs: number;
}) => Promise<void>;

type TransientCalendarSyncError = {
  kind: "transient";
  code: string;
  message: string;
  retryAfter?: string | null;
};

export async function processCalendarConnectionSync({
  attempt,
  connection,
  connectionRepository,
  importedBusyIntervalRepository,
  now,
  providerClient,
  scheduleRetry,
}: {
  attempt: number;
  connection: CalendarConnectionSyncRecord;
  connectionRepository: CalendarSyncConnectionRepository;
  importedBusyIntervalRepository: ImportedBusyIntervalRepository;
  scheduleRetry?: CalendarSyncRetryScheduler;
  now: Date;
  providerClient: CalendarSyncProviderClient;
}): Promise<void> {
  try {
    const intervals = await providerClient.fetchImportedBusyIntervals({
      connection,
      now,
      attempt,
    });

    await importedBusyIntervalRepository.upsertBatch(intervals);
    await connectionRepository.updateById(connection.id, {
      status: "connected",
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  } catch (error) {
    const transient = toTransientCalendarSyncError(error);
    if (!transient) {
      throw error;
    }

    await connectionRepository.updateById(connection.id, {
      status: "disconnected",
      lastErrorCode: transient.code,
      lastErrorMessage: transient.message,
    });

    if (!scheduleRetry) {
      return;
    }

    const delayMs = calculateCalendarSyncRetryDelay({
      attempt,
      now,
      random: () => 0,
      retryAfter: transient.retryAfter ?? null,
    });

    await scheduleRetry({
      connectionId: connection.id,
      attempt: attempt + 1,
      delayMs,
    });
  }
}

function toTransientCalendarSyncError(
  error: unknown,
): TransientCalendarSyncError | null {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { kind?: unknown }).kind === "transient" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const retryAfter = (error as { retryAfter?: unknown }).retryAfter;
    return {
      kind: "transient",
      code: (error as { code: string }).code,
      message: (error as { message: string }).message,
      retryAfter:
        typeof retryAfter === "string" || retryAfter === null
          ? retryAfter
          : undefined,
    };
  }

  return null;
}
