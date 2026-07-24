import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setEmailDeliveryServiceForTests } from "./action-required-email-singleton";
import { setConnectionActionRequiredDispatchLookupForTests } from "./action-required-email.repository";
import {
  recordCalendarConnectionSyncFailure,
  setRecordCalendarConnectionSyncFailureForTests,
} from "./sync-failure-recorder";
import { setCalendarConnectionRepositoryForTests } from "./repository";

describe("recordCalendarConnectionSyncFailure", () => {
  beforeEach(() => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";
    process.env.APP_PUBLIC_URL = "https://slotmerge.example";
  });

  afterEach(() => {
    delete process.env.APP_PUBLIC_URL;
    setEmailDeliveryServiceForTests(null);
    setConnectionActionRequiredDispatchLookupForTests(null);
    setRecordCalendarConnectionSyncFailureForTests(null);
    setCalendarConnectionRepositoryForTests(null);
  });

  it("writes the error metadata and triggers a sync-failure action-required email for the connection owner", async () => {
    let storedStatus = "connected";
    const updated: Record<string, unknown> = {};
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-sync-failure" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        storedStatus = String(patch.status ?? storedStatus);
        return Promise.resolve({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          providerAccountKey: "google:connection-1",
          accountIdentifier: "google:connection-1",
          scopes: "https://www.googleapis.com/auth/calendar.freebusy",
          status: "connected" as const,
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          contributingCalendarIds: [],
          ...updated,
        });
      },
    });

    const lookup = vi.fn().mockResolvedValue({
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      user: { email: "user@example.com", displayName: "Ada" },
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "rate-limited",
        message: "Calendar provider returned 429",
      },
      { connectionLookup: lookup },
    );

    expect(result).toMatchObject({ status: "sent", skipped: false });
    expect(updated.lastErrorCode).toBe("rate-limited");
    expect(updated.lastErrorMessage).toBe("Calendar provider returned 429");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const callArgs = sendEmail.mock.calls[0]?.[0] as {
      recipient: string;
      type: string;
      payload: Record<string, unknown>;
    };
    expect(callArgs).toMatchObject({
      recipient: "user@example.com",
      type: "calendar-action-required",
    });
    expect(callArgs.payload).toMatchObject({
      reason: "sync-failure",
      connectionId: "connection-1",
      provider: "google",
    });
    expect(storedStatus).toBe("connected");
  });

  it("returns failed when the underlying update throws (does not send the email)", async () => {
    const sendEmail = vi.fn();
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.reject(new Error("db unavailable")),
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "rate-limited",
        message: "Calendar provider returned 429",
      },
      {
        connectionLookup: vi.fn().mockResolvedValue({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
        }),
      },
    );

    expect(result).toMatchObject({ status: "failed" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("writes the error metadata and skips the email when the dedup window is still active", async () => {
    const updated: Record<string, unknown> = {};
    const sendEmail = vi.fn();
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi
        .fn()
        .mockResolvedValue(new Date(Date.now() - 5 * 60 * 1000)),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        return Promise.resolve({} as never);
      },
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "rate-limited",
        message: "Calendar provider returned 429",
      },
      {
        connectionLookup: vi.fn().mockResolvedValue({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: null },
        }),
      },
    );

    expect(result).toMatchObject({ status: "skipped", skipped: true });
    expect(updated.lastErrorCode).toBe("rate-limited");
    expect(updated.lastErrorMessage).toBe("Calendar provider returned 429");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sets status to needs_reconnect when code is invalid_grant", async () => {
    let storedStatus = "connected";
    const updated: Record<string, unknown> = {};
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-sync-failure" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        storedStatus = String(patch.status ?? storedStatus);
        return Promise.resolve({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          providerAccountKey: "google:connection-1",
          accountIdentifier: "google:connection-1",
          scopes: "https://www.googleapis.com/auth/calendar.freebusy",
          status: "connected" as const,
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          contributingCalendarIds: [],
          ...updated,
        });
      },
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "invalid_grant",
        message: "Token has been revoked",
      },
      {
        connectionLookup: vi.fn().mockResolvedValue({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: "Ada" },
        }),
      },
    );

    expect(result).toMatchObject({ status: "sent", skipped: false });
    expect(updated.lastErrorCode).toBe("invalid_grant");
    expect(updated.lastErrorMessage).toBe("Token has been revoked");
    expect(storedStatus).toBe("needs_reconnect");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sets status to needs_reconnect when code is token_revoked", async () => {
    let storedStatus = "connected";
    const updated: Record<string, unknown> = {};
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-sync-failure" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        storedStatus = String(patch.status ?? storedStatus);
        return Promise.resolve({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          providerAccountKey: "google:connection-1",
          accountIdentifier: "google:connection-1",
          scopes: "https://www.googleapis.com/auth/calendar.freebusy",
          status: "connected" as const,
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          contributingCalendarIds: [],
          ...updated,
        });
      },
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "token_revoked",
        message: "Access token has been revoked",
      },
      {
        connectionLookup: vi.fn().mockResolvedValue({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: "Ada" },
        }),
      },
    );

    expect(result).toMatchObject({ status: "sent", skipped: false });
    expect(updated.lastErrorCode).toBe("token_revoked");
    expect(updated.lastErrorMessage).toBe("Access token has been revoked");
    expect(storedStatus).toBe("needs_reconnect");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("leaves status unchanged for non-OAuth error codes", async () => {
    let storedStatus = "connected";
    const updated: Record<string, unknown> = {};
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-sync-failure" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        storedStatus = String(patch.status ?? storedStatus);
        return Promise.resolve({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          providerAccountKey: "google:connection-1",
          accountIdentifier: "google:connection-1",
          scopes: "https://www.googleapis.com/auth/calendar.freebusy",
          status: "connected" as const,
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          contributingCalendarIds: [],
          ...updated,
        });
      },
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "rate-limited",
        message: "Calendar provider returned 429",
      },
      {
        connectionLookup: vi.fn().mockResolvedValue({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: "Ada" },
        }),
      },
    );

    expect(result).toMatchObject({ status: "sent", skipped: false });
    expect(updated.lastErrorCode).toBe("rate-limited");
    expect(storedStatus).toBe("connected");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sets status to needs_reconnect for invalid_grant", async () => {
    let storedStatus = "connected";
    const updated: Record<string, unknown> = {};
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-sync-failure" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        storedStatus = String(patch.status ?? storedStatus);
        return Promise.resolve({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          providerAccountKey: "google:connection-1",
          accountIdentifier: "google:connection-1",
          scopes: "https://www.googleapis.com/auth/calendar.freebusy",
          status: "connected" as const,
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          contributingCalendarIds: [],
          ...updated,
        });
      },
    });

    const result = await recordCalendarConnectionSyncFailure(
      {
        connectionId: "connection-1",
        provider: "google",
        code: "invalid_grant",
        message: "Google authentication failed",
      },
      {
        connectionLookup: vi.fn().mockResolvedValue({
          id: "connection-1",
          userId: "user-1",
          provider: "google",
          user: { email: "user@example.com", displayName: "Ada" },
        }),
      },
    );

    expect(result).toMatchObject({ status: "sent", skipped: false });
    expect(updated.lastErrorCode).toBe("invalid_grant");
    expect(storedStatus).toBe("needs_reconnect");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
