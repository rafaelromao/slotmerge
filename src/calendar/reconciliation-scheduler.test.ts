import { afterEach, describe, expect, it, vi } from "vitest";

import {
  handleReconciliationJob,
  setReconciliationSchedulerForTests,
  type ReconciliationSchedulerDeps,
} from "./reconciliation-scheduler";

describe("handleReconciliationJob", () => {
  afterEach(() => {
    setReconciliationSchedulerForTests(null);
  });

  it("enqueues sync jobs for all connected calendar connections with stagger delay", async () => {
    const enqueuedJobs: { connectionId: string; backoffMs: number }[] = [];

    setReconciliationSchedulerForTests({
      listConnectedCalendarConnections: vi.fn().mockResolvedValue([
        { id: "conn-1", provider: "google" as const },
        { id: "conn-2", provider: "microsoft" as const },
        { id: "conn-3", provider: "google" as const },
      ]),
      enqueueSync: async (connectionId: string, backoffMs: number) => {
        enqueuedJobs.push({ connectionId, backoffMs });
      },
    });

    await handleReconciliationJob({});

    expect(enqueuedJobs).toHaveLength(3);
    expect(enqueuedJobs.map((j) => j.connectionId).sort()).toEqual([
      "conn-1",
      "conn-2",
      "conn-3",
    ]);
    for (const job of enqueuedJobs) {
      expect(job.backoffMs).toBeGreaterThanOrEqual(0);
      expect(job.backoffMs).toBeLessThanOrEqual(60000);
    }
  });

  it("handles empty list of connected calendar connections gracefully", async () => {
    const enqueuedJobs: { connectionId: string; backoffMs: number }[] = [];

    setReconciliationSchedulerForTests({
      listConnectedCalendarConnections: vi.fn().mockResolvedValue([]),
      enqueueSync: async (connectionId: string, backoffMs: number) => {
        enqueuedJobs.push({ connectionId, backoffMs });
      },
    });

    await handleReconciliationJob({});

    expect(enqueuedJobs).toHaveLength(0);
  });

  it("does not throw when enqueueSync fails for one connection", async () => {
    setReconciliationSchedulerForTests({
      listConnectedCalendarConnections: vi.fn().mockResolvedValue([
        { id: "conn-1", provider: "google" as const },
        { id: "conn-2", provider: "microsoft" as const },
      ]),
      enqueueSync: vi
        .fn()
        .mockRejectedValueOnce(new Error("Queue unavailable"))
        .mockResolvedValue(undefined),
    });

    await expect(handleReconciliationJob({})).resolves.not.toThrow();
  });
});