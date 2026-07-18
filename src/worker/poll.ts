import { listActiveConnections } from "../calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "./sync";
import { loadRuntimeConfig } from "../config/runtime";

export const pollCalendarConnectionsTaskName = "poll_calendar_connections";

export const MAX_JITTER_MS = 5 * 60 * 1000;

export async function handlePollCalendarConnectionsJob(
  options: { clock?: () => Date } = {},
): Promise<void> {
  const clock = options.clock ?? (() => new Date(Date.now()));
  const config = loadRuntimeConfig();
  const activeConnections = await listActiveConnections();

  for (const connection of activeConnections) {
    const jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);
    const runAt = new Date(clock().getTime() + jitterMs);
    await enqueueSyncCalendarConnectionJob(
      connection.id,
      config.databaseUrl,
      runAt,
    );
  }
}
