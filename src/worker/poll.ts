import { listActiveConnections } from "../calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "./sync";
import { loadRuntimeConfig } from "../config/runtime";
import type { Clock } from "../system/clock";
import type { RandomSource } from "../system/random";

export const pollCalendarConnectionsTaskName = "poll_calendar_connections";

export const MAX_JITTER_MS = 5 * 60 * 1000;

export type HandlePollCalendarConnectionsJobDeps = {
  clock: Clock;
  randomSource: RandomSource;
};

export async function handlePollCalendarConnectionsJob(
  _payload: unknown,
  deps: HandlePollCalendarConnectionsJobDeps,
): Promise<void> {
  const { clock, randomSource } = deps;
  const config = loadRuntimeConfig();
  const activeConnections = await listActiveConnections();

  for (const { record: connection } of activeConnections) {
    const jitterMs = Math.floor(randomSource.next() * MAX_JITTER_MS);
    const runAt = new Date(clock.now().getTime() + jitterMs);
    await enqueueSyncCalendarConnectionJob(
      connection.id,
      config.databaseUrl,
      runAt,
    );
  }
}
