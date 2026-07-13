import { listActiveConnections } from "../calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "./sync";
import { loadRuntimeConfig } from "../config/runtime";

export const pollCalendarConnectionsTaskName = "poll_calendar_connections";

const MAX_JITTER_MS = 5 * 60 * 1000;

export async function handlePollCalendarConnectionsJob(): Promise<void> {
  const config = loadRuntimeConfig();
  const activeConnections = await listActiveConnections();

  for (const { record: connection } of activeConnections) {
    const jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);
    const runAt = new Date(Date.now() + jitterMs);
    await enqueueSyncCalendarConnectionJob(
      connection.id,
      config.databaseUrl,
      runAt,
    );
  }
}
