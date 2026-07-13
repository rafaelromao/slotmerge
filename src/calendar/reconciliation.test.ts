import { describe, expect, it, vi } from "vitest";

import { reconcileCalendarConnections } from "./reconciliation";

describe("reconcileCalendarConnections", () => {
  it("refreshes only active connections inside the rolling window", async () => {
    const enqueueJob = vi.fn().mockResolvedValue(undefined);

    await reconcileCalendarConnections({
      now: new Date("2026-07-12T12:00:00.000Z"),
      random: () => 0,
      listConnections: vi.fn().mockResolvedValue([
        {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          status: "connected",
          contributingCalendarIds: ["primary"],
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        {
          id: "connection-2",
          userId: "user-2",
          provider: "microsoft",
          status: "disconnected",
          contributingCalendarIds: ["calendar-1"],
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      ]),
      enqueueJob,
    });

    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob.mock.calls[0]?.[0]).toMatchObject({
      connectionId: "connection-1",
      provider: "google",
      source: "reconciliation",
    });
  });
});
