import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import {
  createPostgresImportedBusyIntervalRepository,
} from "../calendar/imported-busy-intervals";
import { decryptCalendarToken } from "../calendar/token-encryption";
import {
  calendarSyncTaskName,
  handleCalendarSyncJob,
  type CalendarSyncJobPayload,
} from "../calendar/sync-jobs";
import { findCalendarConnectionById } from "../calendar/repository";
import { recordCalendarConnectionSyncFailure } from "../calendar/sync-failure-recorder";
import {
  fetchGoogleFreeBusyRaw,
  fetchMicrosoftFreeBusyRaw,
} from "../calendar/sync-jobs";

export { calendarSyncTaskName };

export async function handleCalendarSyncTask(
  payload: unknown,
): Promise<void> {
  const job = parseCalendarSyncPayload(payload);
  const config = loadRuntimeConfig();

  const result = await handleCalendarSyncJob(job, {
    findConnectionById: async (id) => {
      const conn = await findCalendarConnectionById(id);
      if (!conn) return null;
      return conn;
    },
    decryptAccessToken: (encrypted: string) =>
      decryptCalendarToken({ ciphertext: encrypted, key: config.calendarTokenEncryptionKey }),
    fetchGoogleFreeBusy: fetchGoogleFreeBusyRaw,
    fetchMicrosoftFreeBusy: fetchMicrosoftFreeBusyRaw,
    upsertBusyIntervals: async (intervals) => {
      const repo = createPostgresImportedBusyIntervalRepository();
      await repo.upsertBatch(intervals);
    },
    recordSyncFailure: recordCalendarConnectionSyncFailure,
    enqueueSync: async (connectionId: string, backoffMs?: number) => {
      await enqueueCalendarSyncTask(connectionId, config.databaseUrl, backoffMs);
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
      { connectionString: databaseUrl, timezone: "UTC" },
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