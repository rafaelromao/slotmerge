import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";
import {
  clearInMemoryImportedBusyIntervalStore,
  getImportedBusyIntervalRepository,
} from "../calendar/imported-busy-intervals";
import {
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
