import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { getImportedBusyIntervalRepository } from "../calendar/imported-busy-intervals";
import { decryptCalendarToken } from "../calendar/token-encryption";
import {
  calendarSyncTaskName,
  handleCalendarSyncJob,
  type CalendarSyncJobPayload,
} from "../calendar/sync-jobs";
import { findCalendarConnectionById } from "../calendar/repository";
import {
  recordCalendarConnectionSyncFailure,
  type CalendarConnectionUserLookup,
} from "../calendar/sync-failure-recorder";
import {
  fetchGoogleFreeBusyRaw,
  fetchMicrosoftFreeBusyRaw,
} from "../calendar/sync-jobs";

export { calendarSyncTaskName };

export async function handleCalendarSyncTask(payload: unknown): Promise<void> {
  const job = parseCalendarSyncPayload(payload);
  const config = loadRuntimeConfig();

  const wrappedRecordSyncFailure: typeof recordCalendarConnectionSyncFailure =
    async (input, deps) => {
      const adaptedLookup: CalendarConnectionUserLookup = async (
        connectionId,
      ) => {
        const result = await findCalendarConnectionById(connectionId);
        if (!result) return null;
        return {
          id: result.record.id,
          userId: result.record.userId,
          provider: result.provider,
          user: { email: "", displayName: null },
        };
      };
      return recordCalendarConnectionSyncFailure(input, {
        ...deps,
        connectionLookup: adaptedLookup,
      });
    };

  const result = await handleCalendarSyncJob(job, {
    findConnectionById: findCalendarConnectionById,
    decryptAccessToken: (encrypted: string) =>
      decryptCalendarToken({
        ciphertext: encrypted,
        key: config.calendarTokenEncryptionKey,
      }),
    fetchGoogleFreeBusy: (params) =>
      fetchGoogleFreeBusyRaw(
        params.accessToken,
        params.calendarIds,
        params.timeMin,
        params.timeMax,
      ),
    fetchMicrosoftFreeBusy: (params) =>
      fetchMicrosoftFreeBusyRaw(
        params.accessToken,
        params.calendarIds,
        params.timeMin,
        params.timeMax,
      ),
    upsertBusyIntervals: async (intervals) => {
      const repo = getImportedBusyIntervalRepository();
      await repo.upsertBatch(intervals);
    },
    recordSyncFailure: wrappedRecordSyncFailure,
    enqueueSync: async (connectionId: string, backoffMs?: number) => {
      await enqueueCalendarSyncTask(
        connectionId,
        config.databaseUrl,
        backoffMs,
      );
    },
    clock: () => new Date(),
  });

  if (result.status === "retry_scheduled") {
    return;
  }
}

async function enqueueCalendarSyncTask(
  connectionId: string,
  databaseUrl: string,
  backoffMs?: number,
): Promise<void> {
  const payload: CalendarSyncJobPayload = { connectionId };
  if (backoffMs) {
    const runAt = new Date(Date.now() + backoffMs);
    await quickAddJob(
      { connectionString: databaseUrl },
      calendarSyncTaskName,
      payload,
      { runAt },
    );
  } else {
    await quickAddJob(
      { connectionString: databaseUrl },
      calendarSyncTaskName,
      payload,
    );
  }
}

function parseCalendarSyncPayload(payload: unknown): CalendarSyncJobPayload {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "connectionId" in payload &&
    typeof payload.connectionId === "string"
  ) {
    return { connectionId: payload.connectionId };
  }
  throw new Error("calendar sync job requires connectionId");
}
