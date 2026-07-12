import type { CalendarConnectionSyncRecord } from "./sync";

export type CalendarSyncSource = "webhook" | "reconciliation";

export type CalendarSyncQueueJob = {
  connectionId: string;
  provider: CalendarConnectionSyncRecord["provider"];
  source: CalendarSyncSource;
  attempt: number;
  runAt: Date;
};

export type EnqueueCalendarSyncJob = (
  job: CalendarSyncQueueJob,
) => Promise<void>;

export async function scheduleCalendarConnectionSyncJobs({
  connections,
  enqueueJob,
  now,
  random,
  source,
}: {
  connections: ReadonlyArray<CalendarConnectionSyncRecord>;
  enqueueJob: EnqueueCalendarSyncJob;
  now: Date;
  random: () => number;
  source: CalendarSyncSource;
}): Promise<void> {
  await Promise.all(
    connections.map(async (connection, index) => {
      const runAt = new Date(
        now.getTime() + index * 60_000 + Math.round(random() * 30_000),
      );

      await enqueueJob({
        connectionId: connection.id,
        provider: connection.provider,
        source,
        attempt: 1,
        runAt,
      });
    }),
  );
}
