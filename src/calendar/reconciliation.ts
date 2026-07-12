import { scheduleCalendarConnectionSyncJobs } from "./sync-queue";
import type { CalendarConnectionSyncRecord } from "./sync";
import type { EnqueueCalendarSyncJob } from "./sync-queue";

export async function reconcileCalendarConnections({
  listConnections,
  enqueueJob,
  now,
  random,
}: {
  listConnections: () => Promise<ReadonlyArray<CalendarConnectionSyncRecord>>;
  enqueueJob: EnqueueCalendarSyncJob;
  now: Date;
  random: () => number;
}): Promise<void> {
  const connections = (await listConnections()).filter(
    (connection) => connection.status === "connected",
  );

  await scheduleCalendarConnectionSyncJobs({
    connections,
    enqueueJob,
    now,
    random,
    source: "reconciliation",
  });
}
