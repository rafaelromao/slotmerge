import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { handleSyncCalendarConnectionJob } from "../../src/calendar/sync-handler";
import type { SyncCalendarConnectionPayload } from "../../src/calendar/sync-jobs";
import {
  setImportedBusyIntervalRepositoryForTests,
  clearInMemoryImportedBusyIntervalStore,
} from "../../src/calendar/imported-busy-intervals";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../../src/calendar/repository";
import {
  setRecordCalendarConnectionSyncFailureForTests,
} from "../../src/calendar/sync-failure-recorder";
import {
  setEmailDeliveryServiceForTests,
} from "../../src/calendar/action-required-email-singleton";
import {
  setConnectionActionRequiredDispatchLookupForTests,
} from "../../src/calendar/action-required-email.repository";

const mockedGoogleConnection = {
  id: "connection-1",
  userId: "user-1",
  provider: "google" as const,
  providerAccountKey: "google:connection-1",
  accountIdentifier: "user@example.com",
  scopes: "https://www.googleapis.com/auth/calendar.freebusy",
  status: "connected" as const,
  refreshTokenEncrypted: Buffer.from("decrypted-refresh-token").toString("base64"),
  accessTokenEncrypted: Buffer.from("decrypted-access-token").toString("base64"),
  accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
  lastErrorCode: null,
  lastErrorMessage: null,
  contributingCalendarIds: ["primary"],
};

const mockedMicrosoftConnection = {
  id: "connection-2",
  userId: "user-1",
  provider: "microsoft" as const,
  providerAccountKey: "microsoft:connection-2",
  accountIdentifier: "user@example.com",
  scopes: "Calendars.ReadBasic",
  status: "connected" as const,
  refreshTokenEncrypted: Buffer.from("decrypted-refresh-token").toString("base64"),
  accessTokenEncrypted: Buffer.from("decrypted-access-token").toString("base64"),
  accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
  lastErrorCode: null,
  lastErrorMessage: null,
  contributingCalendarIds: ["primary"],
};

describe("handleSyncCalendarConnectionJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret";
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "microsoft-client-id";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "microsoft-client-secret";
    process.env.APP_PUBLIC_URL = "https://slotmerge.example";
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";

    setEmailDeliveryServiceForTests({ sendEmail: vi.fn() });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setImportedBusyIntervalRepositoryForTests(null);
    clearInMemoryImportedBusyIntervalStore();
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    setRecordCalendarConnectionSyncFailureForTests(null);
    setEmailDeliveryServiceForTests(null);
    setConnectionActionRequiredDispatchLookupForTests(null);
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.MICROSOFT_OAUTH_CLIENT_ID;
    delete process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    delete process.env.APP_PUBLIC_URL;
  });

  it("fetches free/busy from Google and upserts intervals", async () => {
    const upsertedIntervals: unknown[] = [];

    setImportedBusyIntervalRepositoryForTests({
      upsertBatch: (intervals) => {
        upsertedIntervals.push(...intervals);
        return Promise.resolve();
      },
      deleteByConnectionId: () => Promise.resolve(),
      findByUserIdAndDateRange: () => Promise.resolve([]),
      deleteExpiredBefore: () => Promise.resolve(0),
    });

    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: (id) => {
        if (id === "connection-1") {
          return Promise.resolve({ ...mockedGoogleConnection });
        }
        return Promise.resolve(null);
      },
      updateById: () => Promise.resolve(null),
    });

    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    let fetchCalls = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      fetchCalls++;

      if (fetchCalls === 1 && url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "new-access-token",
            expires_in: 3600,
            refresh_token: "new-refresh-token",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("googleapis.com/calendar/v3/freeBusy")) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  { start: "2026-07-14T09:00:00Z", end: "2026-07-14T10:00:00Z" },
                  { start: "2026-07-15T14:00:00Z", end: "2026-07-15T15:00:00Z" },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("{}", { status: 200 });
    });

    setRecordCalendarConnectionSyncFailureForTests(vi.fn().mockResolvedValue({ status: "sent", skipped: false }));

    const payload: SyncCalendarConnectionPayload = {
      connectionId: "connection-1",
      attemptNumber: 1,
    };

    await handleSyncCalendarConnectionJob(payload, {
      fetchImpl: fetchMock,
      decryptToken: (ciphertext: string) => Buffer.from(ciphertext, "base64").toString("utf-8"),
    });

    expect(upsertedIntervals).toHaveLength(2);
  });

  it("fetches free/busy from Microsoft and upserts intervals", async () => {
    const upsertedIntervals: unknown[] = [];

    setImportedBusyIntervalRepositoryForTests({
      upsertBatch: (intervals) => {
        upsertedIntervals.push(...intervals);
        return Promise.resolve();
      },
      deleteByConnectionId: () => Promise.resolve(),
      findByUserIdAndDateRange: () => Promise.resolve([]),
      deleteExpiredBefore: () => Promise.resolve(0),
    });

    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: (id) => {
        if (id === "connection-2") {
          return Promise.resolve({ ...mockedMicrosoftConnection });
        }
        return Promise.resolve(null);
      },
      updateById: () => Promise.resolve(null),
    });

    let fetchCalls = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      fetchCalls++;

      if (fetchCalls === 1 && url.includes("login.microsoftonline.com")) {
        return new Response(
          JSON.stringify({
            access_token: "new-access-token",
            expires_in: 3600,
            refresh_token: "new-refresh-token",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (url.includes("graph.microsoft.com/v1.0/me/calendar/getSchedule")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                scheduleId: "user@example.com",
                availabilityView: "2",
                scheduleItems: [
                  {
                    start: "2026-07-14T09:00:00Z",
                    end: "2026-07-14T10:00:00Z",
                    status: "busy",
                  },
                  {
                    start: "2026-07-15T14:00:00Z",
                    end: "2026-07-15T15:00:00Z",
                    status: "tentative",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("{}", { status: 200 });
    });

    setRecordCalendarConnectionSyncFailureForTests(vi.fn().mockResolvedValue({ status: "sent", skipped: false }));

    const payload: SyncCalendarConnectionPayload = {
      connectionId: "connection-2",
      attemptNumber: 1,
    };

    await handleSyncCalendarConnectionJob(payload, {
      fetchImpl: fetchMock,
      decryptToken: (ciphertext: string) => Buffer.from(ciphertext, "base64").toString("utf-8"),
    });

    expect(upsertedIntervals).toHaveLength(2);
  });

  it("calls recordCalendarConnectionSyncFailure when connection not found", async () => {
    const failureRecorded = vi.fn().mockResolvedValue({ status: "sent", skipped: false });

    setGoogleCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    setMicrosoftCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });

    setRecordCalendarConnectionSyncFailureForTests(failureRecorded);

    const payload: SyncCalendarConnectionPayload = {
      connectionId: "connection-not-found",
      attemptNumber: 1,
    };

    await handleSyncCalendarConnectionJob(payload, {
      fetchImpl: vi.fn(),
      decryptToken: (ciphertext: string) => Buffer.from(ciphertext, "base64").toString("utf-8"),
    });

    expect(failureRecorded).toHaveBeenCalledTimes(1);
    const callArgs = failureRecorded.mock.calls[0][0] as {
      connectionId: string;
      provider: string;
      code: string;
      message: string;
    };
    expect(callArgs).toMatchObject({
      connectionId: "connection-not-found",
      provider: "google",
      code: "connection_not_found",
      message: "Calendar connection not found",
    });
  });
});