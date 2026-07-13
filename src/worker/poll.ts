import { listActiveConnections } from "../calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "./sync";
import { loadRuntimeConfig } from "../config/runtime";

export const pollCalendarConnectionsTaskName = "poll_calendar_connections";

export async function handlePollCalendarConnectionsJob(): Promise<void> {
  const config = loadRuntimeConfig();
  const activeConnections = await listActiveConnections();

  for (const { record: connection } of activeConnections) {
    await enqueueSyncCalendarConnectionJob(connection.id, config.databaseUrl);
  }
}
