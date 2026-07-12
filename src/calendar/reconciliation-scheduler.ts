import { randomInt } from "node:crypto";

import type { CalendarProvider } from "../db/schema";

export const reconciliationTaskName = "calendar_reconciliation";

export type ReconciliationSchedulerDeps = {
  listConnectedCalendarConnections(): Promise<
    Array<{ id: string; provider: CalendarProvider }>
  >;
  enqueueSync(connectionId: string, backoffMs: number): Promise<void>;
};

let depsOverride: ReconciliationSchedulerDeps | null = null;

export function setReconciliationSchedulerForTests(
  d: ReconciliationSchedulerDeps | null,
) {
  depsOverride = d;
}

function getDeps(): ReconciliationSchedulerDeps {
  if (!depsOverride) {
    throw new Error("Reconciliation scheduler deps not configured for tests");
  }
  return depsOverride;
}

export async function handleReconciliationJob(): Promise<void> {
  const deps = getDeps();

  const connections = await deps.listConnectedCalendarConnections();

  for (const connection of connections) {
    const staggerMs = randomInt(0, 60001);
    try {
      await deps.enqueueSync(connection.id, staggerMs);
    } catch {
      // Log but don't fail the entire reconciliation job
      // The next scheduled reconciliation will retry
    }
  }
}