import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportedBusyIntervalRecord } from "./imported-busy-intervals";
import {
  clearInMemoryImportedBusyIntervalStore,
  getImportedBusyIntervalRepository,
  setImportedBusyIntervalRepositoryForTests,
} from "./imported-busy-intervals";

const fixedNow = new Date("2026-07-12T12:00:00.000Z");

// isWithinRollingWindow calls `new Date()` directly inside the in-memory
// repository. The test data uses fixed dates around 2026-07-12; without
// freezing the wall clock the rolling-window check drifts once real time
// crosses those dates and the assertions see an empty store.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(fixedNow);
});

afterEach(() => {
  vi.useRealTimers();
  clearInMemoryImportedBusyIntervalStore();
});

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

const outOfOfficeInterval: ImportedBusyIntervalRecord = {
  id: "interval-2",
  userId: "user-1",
  connectionId: "connection-1",
  providerCalendarId: "primary",
  providerEventReference: "event-ref-2",
  status: "out-of-office",
  startAt: new Date("2026-07-16T09:00:00.000Z"),
  endAt: new Date("2026-07-16T10:00:00.000Z"),
  importedAt: fixedNow,
};

const tentativeInterval: ImportedBusyIntervalRecord = {
  id: "interval-3",
  userId: "user-1",
  connectionId: "connection-1",
  providerCalendarId: "primary",
  providerEventReference: "event-ref-3",
  status: "tentative",
  startAt: new Date("2026-07-17T09:00:00.000Z"),
  endAt: new Date("2026-07-17T10:00:00.000Z"),
  importedAt: fixedNow,
};

const futureIntervalBeyond90Days: ImportedBusyIntervalRecord = {
  id: "interval-4",
  userId: "user-1",
  connectionId: "connection-1",
  providerCalendarId: "primary",
  providerEventReference: "event-ref-4",
  status: "busy",
  startAt: new Date("2027-01-01T09:00:00.000Z"),
  endAt: new Date("2027-01-01T10:00:00.000Z"),
  importedAt: fixedNow,
};

describe("ImportedBusyIntervalRepository contract", () => {
  it("upsertBatch stores intervals and findByUserIdAndDateRange retrieves them", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([busyInterval]);

    const found = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("interval-1");
  });

  it("preserves status per interval", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([
      busyInterval,
      outOfOfficeInterval,
      tentativeInterval,
    ]);

    const found = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(found).toHaveLength(3);
    const statuses = found.map((i) => i.status).sort();
    expect(statuses).toEqual(["busy", "out-of-office", "tentative"]);
  });

  it("findByUserIdAndDateRange returns empty array when no intervals match", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([busyInterval]);

    const found = await repo.findByUserIdAndDateRange(
      "user-999",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(found).toHaveLength(0);
  });

  it("findByUserIdAndDateRange respects date range boundaries", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([busyInterval]);

    const foundBefore = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-14T23:59:59.999Z"),
    );
    expect(foundBefore).toHaveLength(0);

    const foundAfter = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-16T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );
    expect(foundAfter).toHaveLength(0);

    const foundExactly = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-15T00:00:00.000Z"),
      new Date("2026-07-15T23:59:59.999Z"),
    );
    expect(foundExactly).toHaveLength(1);
  });

  it("deleteByConnectionId removes all intervals for that connection", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([busyInterval, outOfOfficeInterval]);
    await repo.deleteByConnectionId("connection-1");

    const found = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );
    expect(found).toHaveLength(0);
  });

  it("upsertBatch replaces existing intervals with same connectionId and id", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([busyInterval]);

    const updatedInterval: ImportedBusyIntervalRecord = {
      ...busyInterval,
      endAt: new Date("2026-07-15T11:00:00.000Z"),
    };
    await repo.upsertBatch([updatedInterval]);

    const found = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.endAt).toEqual(new Date("2026-07-15T11:00:00.000Z"));
  });

  it("deleteExpiredBefore removes intervals with startAt before the cutoff", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([
      busyInterval,
      outOfOfficeInterval,
      tentativeInterval,
    ]);

    const deletedCount = await repo.deleteExpiredBefore(
      new Date("2026-07-16T00:00:00.000Z"),
    );

    expect(deletedCount).toBe(1);

    const remaining = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );
    expect(remaining).toHaveLength(2);
  });

  it("only stores intervals within rolling 90-day window", async () => {
    const repo = getImportedBusyIntervalRepository();

    await repo.upsertBatch([busyInterval, futureIntervalBeyond90Days]);

    const found = await repo.findByUserIdAndDateRange(
      "user-1",
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2027-12-31T23:59:59.999Z"),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("interval-1");
  });
});

describe("ImportedBusyIntervalRepository override wiring", () => {
  afterEach(() => {
    setImportedBusyIntervalRepositoryForTests(null);
    clearInMemoryImportedBusyIntervalStore();
  });

  it("returns the override repository when set", () => {
    const repo = getImportedBusyIntervalRepository();
    setImportedBusyIntervalRepositoryForTests(repo);

    expect(getImportedBusyIntervalRepository()).toBe(repo);
  });
});
