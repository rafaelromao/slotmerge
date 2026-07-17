import { describe, expect, it, vi } from "vitest";

import { processEmailDeliveryJob } from "./worker";

const pinnedClock = (iso: string) => ({ now: () => new Date(iso) });

describe("email delivery worker - admin-critical trigger", () => {
  it("triggers an admin-critical email when transport delivery fails", async () => {
    const trigger = vi.fn().mockResolvedValue({ deliveries: [] });

    await expect(
      processEmailDeliveryJob(
        {
          emailEventId: "email-event-3",
          recipient: "user@example.com",
          type: "invite",
          payload: { inviteId: "invite-3" },
        },
        {
          clock: pinnedClock("2026-01-01T02:00:00.000Z"),
          eventRepository: failedAttemptRepository(),
          transport: {
            send: () => Promise.reject(new Error("provider unavailable")),
          },
          criticalEmail: { trigger },
        },
      ),
    ).rejects.toThrow("provider unavailable");

    expect(trigger).toHaveBeenCalledTimes(1);
    const callArg = trigger.mock.calls[0][0] as {
      kind: string;
      summary: string;
      details: Record<string, unknown>;
    };
    expect(callArg.kind).toBe("transactional-email-failure");
    expect(callArg.summary).toEqual(
      expect.stringMatching(/provider unavailable/),
    );
    expect(callArg.details).toMatchObject({
      recipient: "user@example.com",
      emailType: "invite",
      emailEventId: "email-event-3",
    });
  });
});

describe("email delivery worker - admin-critical trigger more", () => {
  it("does not trigger an admin-critical email on successful delivery", async () => {
    const trigger = vi.fn().mockResolvedValue({ deliveries: [] });

    await processEmailDeliveryJob(
      {
        emailEventId: "email-event-4",
        recipient: "user@example.com",
        type: "invite",
        payload: { inviteId: "invite-4" },
      },
      {
        clock: pinnedClock("2026-01-01T03:00:00.000Z"),
        eventRepository: deliveredRepository(),
        transport: {
          send: () =>
            Promise.resolve({ providerMessageId: "provider-message-4" }),
        },
        criticalEmail: { trigger },
      },
    );

    expect(trigger).not.toHaveBeenCalled();
  });
});

function failedAttemptRepository() {
  return {
    recordAttempt: (emailEventId: string) =>
      Promise.resolve({
        id: emailEventId,
        recipient: "user@example.com",
        type: "invite" as const,
        payloadReference: "payload-ref",
        status: "sending" as const,
        attempts: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        sentAt: null,
        failedAt: null,
        lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
    markDelivered: () => Promise.reject(new Error("not expected")),
    markFailed: (
      emailEventId: string,
      failedAt: Date,
      error: { code?: string | null; message: string },
    ) =>
      Promise.resolve({
        id: emailEventId,
        recipient: "user@example.com",
        type: "invite" as const,
        payloadReference: "payload-ref",
        status: "failed" as const,
        attempts: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: failedAt,
        sentAt: null,
        failedAt,
        lastAttemptAt: failedAt,
        lastErrorCode: error.code ?? null,
        lastErrorMessage: error.message,
      }),
  };
}

function deliveredRepository() {
  return {
    recordAttempt: (emailEventId: string) =>
      Promise.resolve({
        id: emailEventId,
        recipient: "user@example.com",
        type: "invite" as const,
        payloadReference: "payload-ref",
        status: "sending" as const,
        attempts: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        sentAt: null,
        failedAt: null,
        lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
    markDelivered: (emailEventId: string) =>
      Promise.resolve({
        id: emailEventId,
        recipient: "user@example.com",
        type: "invite" as const,
        payloadReference: "payload-ref",
        status: "sent" as const,
        attempts: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        sentAt: new Date("2026-01-01T00:00:00.000Z"),
        failedAt: null,
        lastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
    markFailed: () => Promise.reject(new Error("not expected")),
  };
}

describe("email delivery worker - admin-critical trigger extra", () => {
  it("rethrows the original error even if the critical-email trigger itself throws", async () => {
    const trigger = vi.fn().mockRejectedValue(new Error("alert pipeline down"));

    await expect(
      processEmailDeliveryJob(
        {
          emailEventId: "email-event-5",
          recipient: "user@example.com",
          type: "invite",
          payload: { inviteId: "invite-5" },
        },
        {
          clock: pinnedClock("2026-01-01T04:00:00.000Z"),
          eventRepository: failedAttemptRepository(),
          transport: {
            send: () => Promise.reject(new Error("provider unavailable")),
          },
          criticalEmail: { trigger },
        },
      ),
    ).rejects.toThrow("provider unavailable");
  });

  it("skips the trigger when the worker is constructed without a critical-email dependency", async () => {
    await expect(
      processEmailDeliveryJob(
        {
          emailEventId: "email-event-6",
          recipient: "user@example.com",
          type: "invite",
          payload: { inviteId: "invite-6" },
        },
        {
          clock: pinnedClock("2026-01-01T05:00:00.000Z"),
          eventRepository: failedAttemptRepository(),
          transport: {
            send: () => Promise.reject(new Error("provider unavailable")),
          },
        },
      ),
    ).rejects.toThrow("provider unavailable");
  });
});
