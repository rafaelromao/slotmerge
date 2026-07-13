import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import type { CalendarSyncQueueJob } from "./sync-queue";

export async function enqueueCalendarConnectionSyncJob(
  job: CalendarSyncQueueJob,
): Promise<void> {
  const config = loadRuntimeConfig();
  await quickAddJob(
    { connectionString: config.databaseUrl },
    "calendar_connection_sync",
    {
      connectionId: job.connectionId,
      provider: job.provider,
      source: job.source,
      attempt: job.attempt,
    },
    { runAt: job.runAt },
  );
}