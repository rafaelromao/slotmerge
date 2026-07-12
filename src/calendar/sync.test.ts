import { describe, expect, it, vi } from "vitest";

import {
  processCalendarConnectionSync,
  type CalendarConnectionSyncRecord,
} from "./sync";

describe("processCalendarConnectionSync", () => {
  it("stores fetched intervals and clears prior sync errors", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const upserts: Array<unknown> = [];

    const connection: CalendarConnectionSyncRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      status: "connected",
      contributingCalendarIds: ["primary"],
      lastErrorCode: "rate-limited",
      lastErrorMessage: "provider said 429",
    };

    await processCalendarConnectionSync({
      attempt: 1,
      connection,
      importedBusyIntervalRepository: {
        upsertBatch: (intervals: unknown[]) => {
          upserts.push(intervals);
          return Promise.resolve();
        },
        deleteByConnectionId: (_connectionId: string) => Promise.resolve(),
        deleteExpiredBefore: (_before: Date) => Promise.resolve(0),
        findByUserIdAndDateRange: (_userId: string, _start: Date, _end: Date) =>
          Promise.resolve([]),
      },
      now: new Date("2026-07-12T12:00:00.000Z"),
      providerClient: {
        fetchImportedBusyIntervals: vi.fn().mockResolvedValue([
          {
            id: "interval-1",
            userId: "user-1",
            connectionId: "connection-1",
            providerCalendarId: "primary",
            providerEventReference: "event-1",
            status: "busy",
            startAt: new Date("2026-07-15T09:00:00.000Z"),
            endAt: new Date("2026-07-15T10:00:00.000Z"),
            importedAt: new Date("2026-07-12T12:00:00.000Z"),
          },
        ]),
      },
      connectionRepository: {
        createPending: (record: never) => Promise.resolve(record),
        listByUserId: (_userId: string) => Promise.resolve([]),
        findById: (_id: string) => Promise.resolve(null),
        updateById: (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, ...patch });
          return Promise.resolve({ ...connection, ...patch } as never);
        },
      },
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toEqual([
      expect.objectContaining({
        id: "interval-1",
        connectionId: "connection-1",
        providerCalendarId: "primary",
      }),
    ]);
    expect(updates).toEqual([
      expect.objectContaining({
        id: "connection-1",
        lastErrorCode: null,
        lastErrorMessage: null,
      }),
    ]);
  });

  it("reschedules transient failures using Retry-After", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const retries: Array<Record<string, unknown>> = [];

    const connection: CalendarConnectionSyncRecord = {
      id: "connection-1",
      userId: "user-1",
      provider: "google",
      status: "connected",
      contributingCalendarIds: ["primary"],
      lastErrorCode: null,
      lastErrorMessage: null,
    };

    await processCalendarConnectionSync({
      attempt: 2,
      connection,
      importedBusyIntervalRepository: {
        upsertBatch: (_intervals: unknown[]) => Promise.resolve(),
        deleteByConnectionId: (_connectionId: string) => Promise.resolve(),
        deleteExpiredBefore: (_before: Date) => Promise.resolve(0),
        findByUserIdAndDateRange: (_userId: string, _start: Date, _end: Date) =>
          Promise.resolve([]),
      },
      now: new Date("2026-07-12T12:00:00.000Z"),
      providerClient: {
        fetchImportedBusyIntervals: vi.fn().mockRejectedValue({
          kind: "transient",
          code: "rate-limited",
          message: "Calendar provider returned 429",
          retryAfter: "120",
        }),
      },
      connectionRepository: {
        createPending: (record: never) => Promise.resolve(record),
        listByUserId: (_userId: string) => Promise.resolve([]),
        findById: (_id: string) => Promise.resolve(null),
        updateById: (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, ...patch });
          return Promise.resolve({ ...connection, ...patch } as never);
        },
      },
      scheduleRetry: (input) => {
        retries.push(input);
        return Promise.resolve();
      },
    });

    expect(updates).toEqual([
      expect.objectContaining({
        id: "connection-1",
        lastErrorCode: "rate-limited",
        lastErrorMessage: "Calendar provider returned 429",
      }),
    ]);
    expect(retries).toEqual([
      expect.objectContaining({
        connectionId: "connection-1",
        delayMs: 120_000,
        attempt: 3,
      }),
    ]);
  });
});
