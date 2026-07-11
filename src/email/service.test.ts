import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createEmailDeliveryService } from "./service";

describe("email delivery service", () => {
  it("creates a queued email event and sends it through one transport seam", async () => {
    const events: Array<{ id: string; status: string; attempts: number }> = [];
    const transportCalls: Array<{ eventId: string; recipient: string }> = [];
    const payloadReference = createHash("sha256")
      .update(JSON.stringify({ inviteId: "invite-1" }))
      .digest("hex");

    const service = createEmailDeliveryService({
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      eventRepository: {
        createQueuedEvent: (event) => {
          const record = {
            id: "email-event-1",
            ...event,
            status: "queued" as const,
            attempts: 0,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            sentAt: null,
            failedAt: null,
            lastAttemptAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          };
          events.push({
            id: record.id,
            status: record.status,
            attempts: record.attempts,
          });
          return Promise.resolve(record);
        },
        recordAttempt: () => {
          return Promise.reject(new Error("not expected in this test"));
        },
        markDelivered: () => {
          return Promise.reject(new Error("not expected in this test"));
        },
        markFailed: () => {
          return Promise.reject(new Error("not expected in this test"));
        },
      },
      queueJob: (job) => {
        transportCalls.push({
          eventId: job.emailEventId,
          recipient: job.recipient,
        });
        return Promise.resolve();
      },
    });

    const result = await service.sendEmail({
      recipient: "user@example.com",
      type: "invite",
      payload: { inviteId: "invite-1" },
    });

    expect(result.emailEvent.id).toBe("email-event-1");
    expect(events).toEqual([
      { id: "email-event-1", status: "queued", attempts: 0 },
    ]);
    expect(result.emailEvent.payloadReference).toBe(payloadReference);
    expect(transportCalls).toEqual([
      { eventId: "email-event-1", recipient: "user@example.com" },
    ]);
  });
});
