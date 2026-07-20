import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import { triggerAdminCriticalEmail } from "./critical-email";

const kindDedupReference = (kind: string) =>
  createHash("sha256").update(JSON.stringify({ kind })).digest("hex");

describe("triggerAdminCriticalEmail", () => {
  it("returns without sending when there are no active admins", async () => {
    const sendEmail = vi.fn();
    const findMostRecentKindDispatch = vi.fn();

    const result = await triggerAdminCriticalEmail(
      {
        event: {
          kind: "provider-sync-failure",
          summary: "Calendar sync unavailable",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
          details: { provider: "google", affectedConnections: 3 },
        },
      },
      {
        adminDirectory: {
          listActiveAdmins: vi.fn().mockResolvedValue([]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentKindDispatch },
        clock: { now: () => new Date() },
      },
    );

    expect(result.deliveries).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(findMostRecentKindDispatch).not.toHaveBeenCalled();
  });

  it("queues an admin-critical email to each active admin when no prior dispatch is in the dedup window", async () => {
    const event = {
      kind: "transactional-email-failure",
      summary: "Transactional email provider is down",
      occurredAt: new Date("2026-01-01T12:00:00.000Z"),
      details: { provider: "postmark" },
    };

    const sendEmail = vi
      .fn()
      .mockImplementation((input: { recipient: string }) =>
        Promise.resolve({
          emailEvent: { id: `event-${input.recipient}` },
        }),
      );

    const result = await triggerAdminCriticalEmail(
      { event },
      {
        adminDirectory: {
          listActiveAdmins: vi.fn().mockResolvedValue([
            { id: "admin-1", email: "alice@example.com" },
            { id: "admin-2", email: "bob@example.com" },
          ]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: {
          findMostRecentKindDispatch: vi.fn().mockResolvedValue(null),
        },
        clock: { now: () => new Date("2026-01-01T12:00:00.000Z") },
        dedupWindowMs: 15 * 60 * 1000,
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      recipient: "alice@example.com",
      type: "admin-critical",
      payload: {
        kind: "transactional-email-failure",
        summary: "Transactional email provider is down",
        occurredAt: "2026-01-01T12:00:00.000Z",
        details: { provider: "postmark" },
      },
      payloadReference: kindDedupReference("transactional-email-failure"),
    });
    expect(sendEmail.mock.calls[1][0]).toMatchObject({
      recipient: "bob@example.com",
      type: "admin-critical",
      payloadReference: kindDedupReference("transactional-email-failure"),
    });
    expect(result.deliveries).toEqual([
      {
        recipient: "alice@example.com",
        status: "sent",
        emailEventId: "event-alice@example.com",
      },
      {
        recipient: "bob@example.com",
        status: "sent",
        emailEventId: "event-bob@example.com",
      },
    ]);
  });

  it("dispatches only to whatever the admin directory returns (suspended/non-admin users are filtered by the directory)", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-id" },
    });

    const result = await triggerAdminCriticalEmail(
      {
        event: {
          kind: "provider-sync-failure",
          summary: "Sync failure",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      {
        adminDirectory: {
          listActiveAdmins: vi
            .fn()
            .mockResolvedValue([
              { id: "admin-1", email: "active-admin@example.com" },
            ]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: {
          findMostRecentKindDispatch: vi.fn().mockResolvedValue(null),
        },
        clock: { now: () => new Date() },
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(
      (sendEmail.mock.calls[0][0] as { recipient: string }).recipient,
    ).toBe("active-admin@example.com");
    expect(result.deliveries).toHaveLength(1);
  });

  it("skips dispatch when a prior dispatch of the same kind happened inside the dedup window", async () => {
    const sendEmail = vi.fn();
    const occurredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-01T12:05:00.000Z");
    const findMostRecentKindDispatch = vi
      .fn()
      .mockResolvedValue(new Date("2026-01-01T12:04:00.000Z"));

    const result = await triggerAdminCriticalEmail(
      {
        event: {
          kind: "provider-sync-failure",
          summary: "Sync failure",
          occurredAt,
        },
      },
      {
        adminDirectory: {
          listActiveAdmins: vi
            .fn()
            .mockResolvedValue([{ id: "admin-1", email: "alice@example.com" }]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentKindDispatch },
        dedupWindowMs: 15 * 60 * 1000,
        clock: { now: () => now },
      },
    );

    expect(findMostRecentKindDispatch).toHaveBeenCalledWith(
      "provider-sync-failure",
      new Date("2026-01-01T11:50:00.000Z"),
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.deliveries).toEqual([]);
  });

  it("dispatches again when no dispatch of the same kind was returned by the lookup (e.g. prior dispatch is older than the dedup window)", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-id" },
    });
    const now = new Date("2026-01-01T12:00:00.000Z");
    const findMostRecentKindDispatch = vi.fn().mockResolvedValue(null);

    const result = await triggerAdminCriticalEmail(
      {
        event: {
          kind: "provider-sync-failure",
          summary: "Sync failure",
          occurredAt: now,
        },
      },
      {
        adminDirectory: {
          listActiveAdmins: vi
            .fn()
            .mockResolvedValue([{ id: "admin-1", email: "alice@example.com" }]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentKindDispatch },
        dedupWindowMs: 15 * 60 * 1000,
        clock: { now: () => now },
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.deliveries).toHaveLength(1);
  });

  it("dispatches again for a different kind even if another kind was recently dispatched", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-id" },
    });
    const findMostRecentKindDispatch = vi.fn().mockResolvedValue(null);

    const result = await triggerAdminCriticalEmail(
      {
        event: {
          kind: "transactional-email-failure",
          summary: "Email provider is down",
          occurredAt: new Date("2026-01-01T12:00:00.000Z"),
        },
      },
      {
        adminDirectory: {
          listActiveAdmins: vi
            .fn()
            .mockResolvedValue([{ id: "admin-1", email: "alice@example.com" }]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentKindDispatch },
        clock: { now: () => new Date() },
      },
    );

    expect(findMostRecentKindDispatch).toHaveBeenCalledWith(
      "transactional-email-failure",
      expect.any(Date),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.deliveries).toHaveLength(1);
  });

  it("isolates per-recipient failures so one bad recipient does not block the rest", async () => {
    const sendEmail = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve({ emailEvent: { id: "event-1" } }),
      )
      .mockImplementationOnce(() =>
        Promise.reject(new Error("queue unavailable")),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ emailEvent: { id: "event-3" } }),
      );

    const result = await triggerAdminCriticalEmail(
      {
        event: {
          kind: "provider-sync-failure",
          summary: "Sync failure",
          occurredAt: new Date("2026-01-01T12:00:00.000Z"),
        },
      },
      {
        adminDirectory: {
          listActiveAdmins: vi.fn().mockResolvedValue([
            { id: "admin-1", email: "alice@example.com" },
            { id: "admin-2", email: "bob@example.com" },
            { id: "admin-3", email: "carol@example.com" },
          ]),
        },
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: {
          findMostRecentKindDispatch: vi.fn().mockResolvedValue(null),
        },
        clock: { now: () => new Date() },
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(result.deliveries).toEqual([
      {
        recipient: "alice@example.com",
        status: "sent",
        emailEventId: "event-1",
      },
      {
        recipient: "bob@example.com",
        status: "failed",
        error: "queue unavailable",
      },
      {
        recipient: "carol@example.com",
        status: "sent",
        emailEventId: "event-3",
      },
    ]);
  });
});
