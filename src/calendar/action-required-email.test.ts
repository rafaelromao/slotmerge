import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import {
  buildCalendarActionRequiredPayload,
  createConnectionActionRequiredDedupReference,
  triggerCalendarActionRequiredEmail,
} from "./action-required-email";

const dedupReferenceFor = (connectionId: string, reason: string) =>
  createHash("sha256")
    .update(JSON.stringify({ connectionId, reason }))
    .digest("hex");

describe("triggerCalendarActionRequiredEmail", () => {
  it("sends a calendar-action-required email to the connection owner for the token-revoked reason", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-1" },
    });

    const result = await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: "Ada" },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        reason: "token-revoked",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: {
          findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
        },
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      recipient: "user@example.com",
      type: "calendar-action-required",
      payloadReference: dedupReferenceFor("connection-1", "token-revoked"),
    });
    expect(sendEmail.mock.calls[0][0].payload).toMatchObject({
      reason: "token-revoked",
      connectionId: "connection-1",
      provider: "google",
      reconnectUrl: "https://slotmerge.example/me/calendar-connections",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result).toEqual({
      status: "sent",
      emailEventId: "event-1",
      skipped: false,
    });
  });

  it("sends a sync-failure email when the reason is sync-failure", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-2" },
    });

    await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-2",
          userId: "user-2",
          provider: "microsoft",
          user: { email: "user2@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        reason: "sync-failure",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: {
          findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
        },
        clock: () => new Date("2026-01-02T00:00:00.000Z"),
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      recipient: "user2@example.com",
      type: "calendar-action-required",
      payloadReference: dedupReferenceFor("connection-2", "sync-failure"),
    });
    expect(sendEmail.mock.calls[0][0].payload).toMatchObject({
      reason: "sync-failure",
      connectionId: "connection-2",
      provider: "microsoft",
      reconnectUrl: "https://slotmerge.example/me/calendar-connections",
      occurredAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("skips dispatch when a prior calendar-action-required email for the same (connection, reason) was sent inside the dedup window", async () => {
    const sendEmail = vi.fn();
    const occurredAt = new Date("2026-01-01T12:00:00.000Z");
    const now = new Date("2026-01-01T12:05:00.000Z");
    const findMostRecentConnectionDispatch = vi
      .fn()
      .mockResolvedValue(new Date("2026-01-01T12:04:00.000Z"));

    const result = await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt,
        },
        reason: "sync-failure",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentConnectionDispatch },
        clock: () => now,
        dedupWindowMs: 60 * 60 * 1000,
      },
    );

    expect(findMostRecentConnectionDispatch).toHaveBeenCalledWith(
      "connection-1",
      "sync-failure",
      new Date("2026-01-01T11:05:00.000Z"),
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "skipped",
      emailEventId: undefined,
      skipped: true,
    });
  });

  it("dispatches again when the last prior dispatch is older than the dedup window", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-3" },
    });
    const findMostRecentConnectionDispatch = vi
      .fn()
      .mockResolvedValue(new Date("2026-01-01T10:00:00.000Z"));

    await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T12:00:00.000Z"),
        },
        reason: "token-revoked",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentConnectionDispatch },
        clock: () => new Date("2026-01-01T12:00:00.000Z"),
        dedupWindowMs: 30 * 60 * 1000,
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("isolates per-connection dedup so connection A does not suppress connection B", async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValue({ emailEvent: { id: "event-x" } });
    const findMostRecentConnectionDispatch = vi.fn().mockResolvedValue(null);

    await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-a",
          userId: "user-a",
          provider: "google",
          user: { email: "a@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        reason: "token-revoked",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentConnectionDispatch },
      },
    );
    await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-b",
          userId: "user-b",
          provider: "google",
          user: { email: "b@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        reason: "token-revoked",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentConnectionDispatch },
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(findMostRecentConnectionDispatch).toHaveBeenCalledWith(
      "connection-a",
      "token-revoked",
      expect.any(Date),
    );
    expect(findMostRecentConnectionDispatch).toHaveBeenCalledWith(
      "connection-b",
      "token-revoked",
      expect.any(Date),
    );
  });

  it("isolates per-reason dedup so a token-revoked does not suppress a sync-failure", async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValue({ emailEvent: { id: "event-y" } });
    const findMostRecentConnectionDispatch = vi.fn().mockResolvedValue(null);

    await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        reason: "token-revoked",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentConnectionDispatch },
      },
    );
    await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T01:00:00.000Z"),
        },
        reason: "sync-failure",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: { findMostRecentConnectionDispatch },
      },
    );

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("returns a failed result when the email delivery service throws", async () => {
    const sendEmail = vi
      .fn()
      .mockRejectedValue(new Error("queue unavailable"));

    const result = await triggerCalendarActionRequiredEmail(
      {
        connection: {
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
          baseUrl: "https://slotmerge.example",
          occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        },
        reason: "token-revoked",
      },
      {
        emailDeliveryService: { sendEmail },
        lastDispatchLookup: {
          findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
        },
        clock: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      status: "failed",
      error: "queue unavailable",
      skipped: false,
    });
  });
});

describe("createConnectionActionRequiredDedupReference", () => {
  it("returns a deterministic hex hash that depends only on (connectionId, reason)", () => {
    expect(createConnectionActionRequiredDedupReference("c-1", "token-revoked")).toBe(
      dedupReferenceFor("c-1", "token-revoked"),
    );
    expect(createConnectionActionRequiredDedupReference("c-1", "sync-failure")).toBe(
      dedupReferenceFor("c-1", "sync-failure"),
    );
    expect(createConnectionActionRequiredDedupReference("c-2", "token-revoked")).toBe(
      dedupReferenceFor("c-2", "token-revoked"),
    );
  });
});

describe("buildCalendarActionRequiredPayload", () => {
  it("includes a reconnect URL pointing at the Calendar Connection page", () => {
    const payload = buildCalendarActionRequiredPayload({
      connection: {
        id: "connection-1",
        userId: "user-1",
        provider: "google",
        user: { email: "user@example.com", displayName: null },
        baseUrl: "https://slotmerge.example",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      reason: "token-revoked",
    });

    expect(payload).toMatchObject({
      connectionId: "connection-1",
      provider: "google",
      reason: "token-revoked",
      reconnectUrl: "https://slotmerge.example/me/calendar-connections",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
  });
});