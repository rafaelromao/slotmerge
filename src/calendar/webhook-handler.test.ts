import { describe, expect, it, vi } from "vitest";

import { handleCalendarWebhook } from "./webhook-handler";

describe("handleCalendarWebhook", () => {
  it("enqueues sync work once for a validated provider webhook and ignores duplicates", async () => {
    const enqueueJob = vi.fn().mockResolvedValue(undefined);
    const listConnections = vi.fn().mockResolvedValue([
      {
        id: "connection-1",
        userId: "user-1",
        provider: "google",
        status: "connected",
        contributingCalendarIds: ["primary"],
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    ]);

    const seenNotifications = new Set<string>();
    const request = new Request(
      "https://slotmerge.example/webhooks/google/calendar",
      {
        method: "POST",
        headers: {
          "x-webhook-token": "google-secret",
          "x-webhook-notification-id": "notification-1",
        },
      },
    );

    const response = await handleCalendarWebhook(request, {
      provider: "google",
      expectedToken: "google-secret",
      listConnections,
      enqueueJob,
      seenNotifications,
      now: () => new Date("2026-07-12T12:00:00.000Z"),
      random: () => 0,
    });

    const duplicateResponse = await handleCalendarWebhook(request, {
      provider: "google",
      expectedToken: "google-secret",
      listConnections,
      enqueueJob,
      seenNotifications,
      now: () => new Date("2026-07-12T12:00:00.000Z"),
      random: () => 0,
    });

    expect(response.status).toBe(202);
    expect(duplicateResponse.status).toBe(202);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(listConnections).toHaveBeenCalledWith("google");
  });
});
