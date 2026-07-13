import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";

const defaultReconciliationIntervalMs = 6 * 60 * 60 * 1000;

export function startCalendarReconciliationTicker({
  intervalMs = defaultReconciliationIntervalMs,
  random = Math.random,
}: {
  intervalMs?: number;
  random?: () => number;
} = {}): () => void {
  const config = loadRuntimeConfig();

  const enqueue = async () => {
    const runAt = new Date(Date.now() + Math.round(random() * 30_000));
    await Promise.all([
      quickAddJob(
        { connectionString: config.databaseUrl },
        "calendar_connection_reconcile",
        { provider: "google" },
        { runAt },
      ),
      quickAddJob(
        { connectionString: config.databaseUrl },
        "calendar_connection_reconcile",
        { provider: "microsoft" },
        { runAt },
      ),
    ]);
  };

  void enqueue();
  const timer = setInterval(() => {
    void enqueue();
  }, intervalMs);

  return () => clearInterval(timer);
}
