import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";
import {
  clearInMemoryImportedBusyIntervalStore,
  getImportedBusyIntervalRepository,
} from "../calendar/imported-busy-intervals";
import {
  expandBusyIntervalsWithBuffer,
  getImportedBusyIntervalLookup,
  setImportedBusyIntervalLookupForTests,
} from "./imported-busy-intervals";

const fixedNow = new Date("2026-07-12T12:00:00.000Z");

const busyInterval: ImportedBusyIntervalRecord = {
  id: "interval-1",
  userId: "user-1",
  connectionId: "connection-1",
  providerCalendarId: "primary",
  providerEventReference: "event-ref-1",
  status: "busy",
  startAt: new Date("2026-07-15T09:00:00.000Z"),
  endAt: new Date("2026-07-15T10:00:00.000Z"),
  importedAt: fixedNow,
};

describe("ImportedBusyIntervalLookup", () => {
  afterEach(() => {
    setImportedBusyIntervalLookupForTests(null);
    clearInMemoryImportedBusyIntervalStore();
  });

  it("returns stored busy intervals for a user within date range", async () => {
    const repo = getImportedBusyIntervalRepository();
    await repo.upsertBatch([busyInterval]);

    const lookup = getImportedBusyIntervalLookup();
    const found = await lookup.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("interval-1");
    expect(found[0]?.status).toBe("busy");
  });

  it("returns empty array when no intervals match user", async () => {
    const lookup = getImportedBusyIntervalLookup();
    const found = await lookup.findByUserIdAndDateRange(
      "user-999",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(found).toHaveLength(0);
  });

  it("does not call provider APIs when looking up busy intervals", async () => {
    const repo = getImportedBusyIntervalRepository();
    await repo.upsertBatch([busyInterval]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const lookup = getImportedBusyIntervalLookup();
    await lookup.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns override lookup when set", () => {
    const mockLookup = {
      findByUserIdAndDateRange: vi.fn().mockResolvedValue([busyInterval]),
    };
    setImportedBusyIntervalLookupForTests(mockLookup);

    const lookup = getImportedBusyIntervalLookup();
    expect(lookup).toBe(mockLookup);
  });
});

describe("expandBusyIntervalsWithBuffer", () => {
  const window9to17 = {
    startUtc: new Date("2026-07-15T09:00:00.000Z"),
    endUtc: new Date("2026-07-15T17:00:00.000Z"),
  };

  it("returns intervals unchanged when bufferMinutes is 0", () => {
    const intervals = [busyInterval];
    const result = expandBusyIntervalsWithBuffer(intervals, 0, [window9to17]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      originalId: "interval-1",
      startAt: busyInterval.startAt,
      endAt: busyInterval.endAt,
      status: "busy",
    });
  });

  it("expands interval end by bufferMinutes when start is at window boundary", () => {
    const intervals = [busyInterval];
    const result = expandBusyIntervalsWithBuffer(intervals, 15, [window9to17]);
    expect(result).toHaveLength(1);
    expect(result[0].startAt).toEqual(new Date("2026-07-15T09:00:00.000Z"));
    expect(result[0].endAt).toEqual(new Date("2026-07-15T10:15:00.000Z"));
    expect(result[0].status).toBe("busy");
  });

  it("clips pre-buffer to window start when interval starts inside window", () => {
    const earlyInterval: ImportedBusyIntervalRecord = {
      ...busyInterval,
      id: "interval-2",
      startAt: new Date("2026-07-15T08:50:00.000Z"),
      endAt: new Date("2026-07-15T09:30:00.000Z"),
    };
    const result = expandBusyIntervalsWithBuffer([earlyInterval], 15, [
      window9to17,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].startAt).toEqual(window9to17.startUtc);
    expect(result[0].endAt).toEqual(new Date("2026-07-15T09:45:00.000Z"));
  });

  it("clips post-buffer end to window end when interval ends inside window", () => {
    const lateInterval: ImportedBusyIntervalRecord = {
      ...busyInterval,
      id: "interval-3",
      startAt: new Date("2026-07-15T16:30:00.000Z"),
      endAt: new Date("2026-07-15T17:10:00.000Z"),
    };
    const result = expandBusyIntervalsWithBuffer([lateInterval], 15, [
      window9to17,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].startAt).toEqual(new Date("2026-07-15T16:15:00.000Z"));
    expect(result[0].endAt).toEqual(window9to17.endUtc);
  });

  it("returns empty when interval is on a different day than window", () => {
    const outsideInterval: ImportedBusyIntervalRecord = {
      ...busyInterval,
      id: "interval-4",
      startAt: new Date("2026-07-16T09:00:00.000Z"),
      endAt: new Date("2026-07-16T10:00:00.000Z"),
    };
    const result = expandBusyIntervalsWithBuffer([outsideInterval], 15, [
      window9to17,
    ]);
    expect(result).toHaveLength(0);
  });

  it("clips pre-buffer only when interval starts inside window", () => {
    const partialInterval: ImportedBusyIntervalRecord = {
      ...busyInterval,
      id: "interval-5",
      startAt: new Date("2026-07-15T08:50:00.000Z"),
      endAt: new Date("2026-07-15T10:00:00.000Z"),
    };
    const result = expandBusyIntervalsWithBuffer([partialInterval], 15, [
      window9to17,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].startAt).toEqual(window9to17.startUtc);
    expect(result[0].endAt).toEqual(new Date("2026-07-15T10:15:00.000Z"));
  });

  it("expands multiple intervals independently without merging", () => {
    const secondInterval: ImportedBusyIntervalRecord = {
      ...busyInterval,
      id: "interval-6",
      startAt: new Date("2026-07-15T11:00:00.000Z"),
      endAt: new Date("2026-07-15T12:00:00.000Z"),
    };
    const result = expandBusyIntervalsWithBuffer(
      [busyInterval, secondInterval],
      15,
      [window9to17],
    );
    expect(result).toHaveLength(2);
  });
});
