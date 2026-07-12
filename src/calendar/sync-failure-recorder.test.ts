import { afterEach, describe, expect, it, vi } from "vitest";

import { setEmailDeliveryServiceForTests } from "./action-required-email-singleton";
import { setConnectionActionRequiredDispatchLookupForTests } from "./action-required-email.repository";
import {
  recordCalendarConnectionSyncFailure,
  setRecordCalendarConnectionSyncFailureForTests,
} from "./sync-failure-recorder";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "./repository";

describe("recordCalendarConnectionSyncFailure", () => {
  afterEach(() => {
    setEmailDeliveryServiceForTests(null);
    setConnectionActionRequiredDispatchLookupForTests(null);
    setRecordCalendarConnectionSyncFailureForTests(null);
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
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
    setGoogleCalendarConnectionRepositoryForTests({
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
          ...updated,
        });
      },
    });
    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
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
    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.reject(new Error("db unavailable")),
    });
    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
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
    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: (id, patch) => {
        if (id !== "connection-1") return Promise.resolve(null);
        Object.assign(updated, patch);
        return Promise.resolve({} as never);
      },
    });
    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
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
});
