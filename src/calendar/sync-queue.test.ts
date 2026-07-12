import { describe, expect, it, vi } from "vitest";

import { scheduleCalendarConnectionSyncJobs } from "./sync-queue";

describe("scheduleCalendarConnectionSyncJobs", () => {
  it("spreads queued sync jobs with randomized offsets", async () => {
    const enqueueJob = vi.fn().mockResolvedValue(undefined);

    await scheduleCalendarConnectionSyncJobs({
      now: new Date("2026-07-12T12:00:00.000Z"),
      connections: [
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
          status: "connected",
          contributingCalendarIds: ["calendar-1"],
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      ],
      random: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.5),
      enqueueJob,
      source: "reconciliation",
    });

    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(enqueueJob.mock.calls[0]?.[0]).toMatchObject({
      connectionId: "connection-1",
      provider: "google",
      attempt: 1,
      source: "reconciliation",
    });
    expect(enqueueJob.mock.calls[0]?.[0].runAt.toISOString()).toBe(
      "2026-07-12T12:00:00.000Z",
    );
    expect(enqueueJob.mock.calls[1]?.[0].runAt.toISOString()).toBe(
      "2026-07-12T12:01:15.000Z",
    );
  });
});
