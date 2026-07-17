import { describe, expect, it } from "vitest";

import { processEmailDeliveryJob } from "./worker";

const pinnedClock = (iso: string) => ({ now: () => new Date(iso) });

describe("email delivery worker", () => {
  it("records an attempt and marks the email delivered on success", async () => {
    const calls: Array<string> = [];

    const result = await processEmailDeliveryJob(
      {
        emailEventId: "email-event-1",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-1" },
      },
      {
        clock: pinnedClock("2026-01-01T00:00:00.000Z"),
        eventRepository: {
          recordAttempt: (emailEventId) => {
            calls.push(`attempt:${emailEventId}`);
            return Promise.resolve({
              id: emailEventId,
              recipient: "user@example.com",
              type: "invite",
              payloadReference: "payload-ref-1",
              status: "sending",
              attempts: 1,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              sentAt: null,
              failedAt: null,
              lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
              lastErrorCode: null,
              lastErrorMessage: null,
            });
          },
          markDelivered: (emailEventId) => {
            calls.push(`delivered:${emailEventId}`);
            return Promise.resolve({
              id: emailEventId,
              recipient: "user@example.com",
              type: "invite",
              payloadReference: "payload-ref-1",
              status: "sent",
              attempts: 1,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              sentAt: new Date("2026-01-01T00:00:00.000Z"),
              failedAt: null,
              lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
              lastErrorCode: null,
              lastErrorMessage: null,
            });
          },
          markFailed: () => {
            return Promise.reject(new Error("not expected"));
          },
        },
        transport: {
          send: (job) => {
            calls.push(`transport:${job.emailEventId}`);
            return Promise.resolve({ providerMessageId: "provider-message-1" });
          },
        },
      },
    );

    expect(calls).toEqual([
      "attempt:email-event-1",
      "transport:email-event-1",
      "delivered:email-event-1",
    ]);
    expect(result.status).toBe("sent");
  });

  it("records a failed attempt and rethrows so the job can retry", async () => {
    const calls: Array<string> = [];

    await expect(
      processEmailDeliveryJob(
        {
          emailEventId: "email-event-2",
          recipient: "user@example.com",
          type: "magic-link",
          payload: { token: "magic-link-token" },
        },
        {
          clock: pinnedClock("2026-01-01T01:00:00.000Z"),
          eventRepository: {
            recordAttempt: (emailEventId) => {
              calls.push(`attempt:${emailEventId}`);
              return Promise.resolve({
                id: emailEventId,
                recipient: "user@example.com",
                type: "magic-link",
                payloadReference: "payload-ref-2",
                status: "sending",
                attempts: 2,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T01:00:00.000Z"),
                sentAt: null,
                failedAt: null,
                lastAttemptAt: new Date("2026-01-01T01:00:00.000Z"),
                lastErrorCode: null,
                lastErrorMessage: null,
              });
            },
            markDelivered: () => {
              return Promise.reject(new Error("not expected"));
            },
            markFailed: (emailEventId, failedAt, error) => {
              calls.push(`failed:${emailEventId}:${error.message}`);
              return Promise.resolve({
                id: emailEventId,
                recipient: "user@example.com",
                type: "magic-link",
                payloadReference: "payload-ref-2",
                status: "failed",
                attempts: 2,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: failedAt,
                sentAt: null,
                failedAt,
                lastAttemptAt: new Date("2026-01-01T01:00:00.000Z"),
                lastErrorCode: "provider-unavailable",
                lastErrorMessage: error.message,
              });
            },
          },
          transport: {
            send: () => {
              calls.push("transport:error");
              return Promise.reject(new Error("provider unavailable"));
            },
          },
        },
      ),
    ).rejects.toThrow("provider unavailable");

    expect(calls).toEqual([
      "attempt:email-event-2",
      "transport:error",
      "failed:email-event-2:provider unavailable",
    ]);
  });
});
