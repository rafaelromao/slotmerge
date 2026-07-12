import { quickAddJob } from "graphile-worker";

import { eq } from "drizzle-orm";
import { loadRuntimeConfig } from "../config/runtime";
import { getDb } from "../db/client";
import { calendarConnections } from "../db/schema";
import { calendarSyncTaskName } from "./calendar-sync";
import type { CalendarSyncJobPayload } from "../calendar/sync-jobs";

export const reconciliationTaskName = "calendar_reconciliation";

export async function handleReconciliationTask(): Promise<void> {
  const config = loadRuntimeConfig();
  const db = getDb();

  const connections = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(eq(calendarConnections.status, "connected"));

  for (const connection of connections) {
    const staggerMs = Math.floor(Math.random() * 60001);
    const job: CalendarSyncJobPayload = { connectionId: connection.id };
    await quickAddJob(
      { connectionString: config.databaseUrl },
      calendarSyncTaskName,
      job,
      { runAt: new Date(Date.now() + staggerMs) },
    );
  }
}