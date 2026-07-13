import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";

export const syncCalendarConnectionTaskName = "sync_calendar_connection";
export const reconcileCalendarConnectionsTaskName =
  "reconcile_calendar_connections";

export type SyncCalendarConnectionPayload = {
  connectionId: string;
  attemptNumber?: number;
};

let enqueueSyncJobOverride:
  | ((connectionId: string, runAt?: Date) => Promise<void>)
  | null = null;

export function setEnqueueSyncJobForTests(
  fn: ((connectionId: string, runAt?: Date) => Promise<void>) | null,
) {
  enqueueSyncJobOverride = fn;
}

export async function enqueueSyncCalendarConnectionJob(
  connectionId: string,
  runAt?: Date,
): Promise<void> {
  if (enqueueSyncJobOverride) {
    return enqueueSyncJobOverride(connectionId, runAt);
  }

  const config = loadRuntimeConfig();
  const payload: SyncCalendarConnectionPayload = {
    connectionId,
    attemptNumber: 1,
  };

  if (runAt) {
    await quickAddJob(
      { connectionString: config.databaseUrl },
      syncCalendarConnectionTaskName,
      payload,
      { runAt },
    );
  } else {
    await quickAddJob(
      { connectionString: config.databaseUrl },
      syncCalendarConnectionTaskName,
      payload,
    );
  }
}

export async function enqueueReconcileCalendarConnectionsJob(): Promise<void> {
  const config = loadRuntimeConfig();
  await quickAddJob(
    { connectionString: config.databaseUrl },
    reconcileCalendarConnectionsTaskName,
    {},
  );
}