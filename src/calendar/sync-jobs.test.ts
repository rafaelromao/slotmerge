import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  handleCalendarSyncJob,
  RateLimitError,
  setCalendarSyncJobForTests,
  enqueueCalendarSync,
  type CalendarSyncJobDeps,
  type CalendarSyncResult,
} from "./sync-jobs";

describe("handleCalendarSyncJob", () => {
  let deps: CalendarSyncJobDeps;

  beforeEach(() => {
    deps = {
      findConnectionById: vi.fn(),
      decryptAccessToken: vi.fn(),
      fetchGoogleFreeBusy: vi.fn(),
      fetchMicrosoftFreeBusy: vi.fn(),
      upsertBusyIntervals: vi.fn(),
      recordSyncFailure: vi.fn(),
      enqueueSync: vi.fn(),
      clock: () => new Date("2026-07-12T12:00:00.000Z"),
    };
  });

  afterEach(() => {
    setCalendarSyncJobForTests(null);
  });

  describe("Google calendar connection", () => {
    it("fetches free/busy from Google API and stores intervals", async () => {
      const connectionId = "google-conn-1";
      const accessToken = "valid-access-token";
      const busyIntervals = [
        {
          id: "interval-1",
          userId: "user-1",
          connectionId,
          providerCalendarId: "primary",
          providerEventReference: "event-1",
          status: "busy" as const,
          startAt: new Date("2026-07-15T09:00:00.000Z"),
          endAt: new Date("2026-07-15T10:00:00.000Z"),
          importedAt: new Date("2026-07-12T12:00:00.000Z"),
        },
      ];

      deps.findConnectionById = vi.fn().mockResolvedValue({
        provider: "google" as const,
        record: {
          id: connectionId,
          userId: "user-1",
          status: "connected",
          accessTokenEncrypted: "encrypted-token",
        },
      });
      deps.decryptAccessToken = vi.fn().mockReturnValue(accessToken);
      deps.fetchGoogleFreeBusy = vi.fn().mockResolvedValue(busyIntervals);
      deps.upsertBusyIntervals = vi.fn().mockResolvedValue(undefined);

      setCalendarSyncJobForTests(deps);

      const result = await handleCalendarSyncJob({ connectionId }, deps);

      expect(result).toEqual({ status: "success" } satisfies CalendarSyncResult);
      expect(deps.fetchGoogleFreeBusy).toHaveBeenCalledWith({
        accessToken,
        calendarIds: ["primary"],
        timeMin: expect.any(Date),
        timeMax: expect.any(Date),
      });
      expect(deps.upsertBusyIntervals).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calledIntervals = (deps.upsertBusyIntervals as any).mock.calls[0]?.[0] as typeof busyIntervals;
      expect(calledIntervals).toHaveLength(1);
      expect(calledIntervals[0]?.providerCalendarId).toBe("primary");
      expect(calledIntervals[0]?.status).toBe("busy");
    });

    it("skips sync when connection status is disconnected", async () => {
      deps.findConnectionById = vi.fn().mockResolvedValue({
        provider: "google" as const,
        record: {
          id: "google-conn-1",
          userId: "user-1",
          status: "disconnected",
          accessTokenEncrypted: null,
        },
      });

      setCalendarSyncJobForTests(deps);

      const result = await handleCalendarSyncJob({ connectionId: "google-conn-1" }, deps);

      expect(result).toEqual({ status: "skipped", reason: "not_connected" } satisfies CalendarSyncResult);
      expect(deps.fetchGoogleFreeBusy).not.toHaveBeenCalled();
      expect(deps.upsertBusyIntervals).not.toHaveBeenCalled();
    });

    it("records failure and re-enqueues with backoff on 429 with Retry-After", async () => {
      deps.findConnectionById = vi.fn().mockResolvedValue({
        provider: "google" as const,
        record: {
          id: "google-conn-1",
          userId: "user-1",
          status: "connected",
          accessTokenEncrypted: "encrypted-token",
        },
      });
      deps.decryptAccessToken = vi.fn().mockReturnValue("access-token");
      deps.fetchGoogleFreeBusy = vi.fn().mockRejectedValue(new RateLimitError(60));
      deps.recordSyncFailure = vi.fn().mockResolvedValue({ status: "recorded" });
      deps.enqueueSync = vi.fn().mockResolvedValue(undefined);

      setCalendarSyncJobForTests(deps);

      const result = await handleCalendarSyncJob({ connectionId: "google-conn-1" }, deps);

      expect(result).toEqual({
        status: "retry_scheduled",
        retryAfterMs: 120000,
      } satisfies CalendarSyncResult);
      expect(deps.recordSyncFailure).toHaveBeenCalled();
      expect(deps.enqueueSync).toHaveBeenCalledWith(
        "google-conn-1",
        120000,
      );
    });

    it("records failure and re-enqueues with jitter on 429 without Retry-After", async () => {
      deps.findConnectionById = vi.fn().mockResolvedValue({
        provider: "google" as const,
        record: {
          id: "google-conn-1",
          userId: "user-1",
          status: "connected",
          accessTokenEncrypted: "encrypted-token",
        },
      });
      deps.decryptAccessToken = vi.fn().mockReturnValue("access-token");
      deps.fetchGoogleFreeBusy = vi.fn().mockRejectedValue(new RateLimitError());
      deps.recordSyncFailure = vi.fn().mockResolvedValue({ status: "recorded" });
      deps.enqueueSync = vi.fn().mockResolvedValue(undefined);

      setCalendarSyncJobForTests(deps);

      const result = await handleCalendarSyncJob({ connectionId: "google-conn-1" }, deps);

      expect(result).toEqual({
        status: "retry_scheduled",
        retryAfterMs: expect.any(Number),
      } satisfies CalendarSyncResult);
      const jitterMs = (result as { retryAfterMs: number }).retryAfterMs;
      expect(jitterMs).toBeGreaterThanOrEqual(30000);
      expect(jitterMs).toBeLessThanOrEqual(120000);
      expect(deps.enqueueSync).toHaveBeenCalled();
    });

    it("records failure on non-retryable error", async () => {
      deps.findConnectionById = vi.fn().mockResolvedValue({
        provider: "google" as const,
        record: {
          id: "google-conn-1",
          userId: "user-1",
          status: "connected",
          accessTokenEncrypted: "encrypted-token",
        },
      });
      deps.decryptAccessToken = vi.fn().mockReturnValue("access-token");
      deps.fetchGoogleFreeBusy = vi.fn().mockRejectedValue(new ApiError("unauthorized", "Token expired"));
      deps.recordSyncFailure = vi.fn().mockResolvedValue({ status: "recorded" });

      setCalendarSyncJobForTests(deps);

      const result = await handleCalendarSyncJob({ connectionId: "google-conn-1" }, deps);

      expect(result).toEqual({ status: "failed" } satisfies CalendarSyncResult);
      expect(deps.recordSyncFailure).toHaveBeenCalledWith(
        {
          connectionId: "google-conn-1",
          provider: "google",
          code: "unauthorized",
          message: "Token expired",
        },
        { connectionLookup: deps.findConnectionById },
      );
    });
  });

  describe("Microsoft calendar connection", () => {
    it("fetches free/busy from Microsoft API and stores intervals", async () => {
      const connectionId = "microsoft-conn-1";
      const accessToken = "valid-access-token";
      const busyIntervals = [
        {
          id: "interval-1",
          userId: "user-1",
          connectionId,
          providerCalendarId: "user@example.com",
          providerEventReference: "event-1",
          status: "busy" as const,
          startAt: new Date("2026-07-15T09:00:00.000Z"),
          endAt: new Date("2026-07-15T10:00:00.000Z"),
          importedAt: new Date("2026-07-12T12:00:00.000Z"),
        },
      ];

      deps.findConnectionById = vi.fn().mockResolvedValue({
        provider: "microsoft" as const,
        record: {
          id: connectionId,
          userId: "user-1",
          status: "connected",
          accessTokenEncrypted: "encrypted-token",
        },
      });
      deps.decryptAccessToken = vi.fn().mockReturnValue(accessToken);
      deps.fetchMicrosoftFreeBusy = vi.fn().mockResolvedValue(busyIntervals);
      deps.upsertBusyIntervals = vi.fn().mockResolvedValue(undefined);

      setCalendarSyncJobForTests(deps);

      const result = await handleCalendarSyncJob({ connectionId }, deps);

      expect(result).toEqual({ status: "success" } satisfies CalendarSyncResult);
      expect(deps.fetchMicrosoftFreeBusy).toHaveBeenCalledWith({
        accessToken,
        calendarIds: ["user@example.com"],
        timeMin: expect.any(Date),
        timeMax: expect.any(Date),
      });
      expect(deps.upsertBusyIntervals).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calledIntervals = (deps.upsertBusyIntervals as any).mock.calls[0]?.[0] as typeof busyIntervals;
      expect(calledIntervals).toHaveLength(1);
      expect(calledIntervals[0]?.providerCalendarId).toBe("user@example.com");
      expect(calledIntervals[0]?.status).toBe("busy");
    });
  });
});

describe("enqueueCalendarSync", () => {
  afterEach(() => {
    setCalendarSyncJobForTests(null);
  });

  it("calls the injected enqueueSync function", async () => {
    const enqueuedJobs: { connectionId: string; backoffMs?: number }[] = [];
    setCalendarSyncJobForTests({
      findConnectionById: vi.fn(),
      decryptAccessToken: vi.fn(),
      fetchGoogleFreeBusy: vi.fn(),
      fetchMicrosoftFreeBusy: vi.fn(),
      upsertBusyIntervals: vi.fn(),
      recordSyncFailure: vi.fn(),
      enqueueSync: async (connectionId, backoffMs) => {
        enqueuedJobs.push({ connectionId, backoffMs });
      },
      clock: () => new Date(),
    });

    await enqueueCalendarSync("connection-1", 5000);

    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]?.connectionId).toBe("connection-1");
    expect(enqueuedJobs[0]?.backoffMs).toBe(5000);
  });
});