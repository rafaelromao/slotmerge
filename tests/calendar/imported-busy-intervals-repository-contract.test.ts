import { afterEach, describe, expect, it } from "vitest";

import {
  createPostgresImportedBusyIntervalRepository,
} from "../../src/calendar/imported-busy-intervals.repository";
import {
  clearInMemoryImportedBusyIntervalStore,
  getImportedBusyIntervalRepository,
} from "../../src/calendar/imported-busy-intervals";
import type {
  ImportedBusyIntervalRecord,
} from "../../src/calendar/imported-busy-intervals";

const fixedNow = new Date("2026-07-12T12:00:00.000Z");

function makeInterval(params: {
  id: string;
  connectionId: string;
  userId?: string;
  startAtDaysFromNow?: number;
}): ImportedBusyIntervalRecord {
  const start = new Date(fixedNow);
  start.setDate(start.getDate() + (params.startAtDaysFromNow ?? 0));
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    id: params.id,
    userId: params.userId ?? "user-contract",
    connectionId: params.connectionId,
    providerCalendarId: "primary",
    providerEventReference: `event-${params.id}`,
    status: "busy",
    startAt: start,
    endAt: end,
    importedAt: fixedNow,
  };
}

async function isPostgresReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { getPool } = await import("../../src/db/client");
    await getPool().query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function isPostgresSchemaReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (!process.env.DATABASE_URL.includes("test") && !process.env.DATABASE_URL.includes("slotmerge_test")) {
    return false;
  }
  try {
    const { getPool } = await import("../../src/db/client");
    const result = await getPool().query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users')",
    );
    return result.rows[0]?.exists === true;
  } catch {
    return false;
  }
}

let postgresAvailable = false;
let schemaReady = false;

describe("ImportedBusyIntervalRepository contract", () => {
  beforeEach(async () => {
    if (!postgresAvailable) {
      postgresAvailable = await isPostgresReachable();
    }
    if (postgresAvailable && !schemaReady) {
      schemaReady = await isPostgresSchemaReady();
    }
  });

  describe("in-memory repository", () => {
    afterEach(() => {
      clearInMemoryImportedBusyIntervalStore();
    });

    it("upsertBatch replaces all intervals for a connectionId (not additive)", async () => {
      const repo = getImportedBusyIntervalRepository();
      const connId = `conn-replace-${Math.random().toString(36).slice(2)}`;

      const first: ImportedBusyIntervalRecord[] = [
        makeInterval({ id: "int-a1", connectionId: connId, startAtDaysFromNow: 1 }),
        makeInterval({ id: "int-a2", connectionId: connId, startAtDaysFromNow: 2 }),
      ];
      const second: ImportedBusyIntervalRecord[] = [
        makeInterval({ id: "int-b1", connectionId: connId, startAtDaysFromNow: 3 }),
      ];

      await repo.upsertBatch(first);
      await repo.upsertBatch(second);

      const found = await repo.findByUserIdAndDateRange(
        "user-contract",
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );

      const ids = found.map((i) => i.id).sort();
      expect(ids).toEqual(["int-b1"]);
    });

    it("upsertBatch with multiple connectionIds only replaces the specified connectionId", async () => {
      const repo = getImportedBusyIntervalRepository();
      const connA = `conn-a-${Math.random().toString(36).slice(2)}`;
      const connB = `conn-b-${Math.random().toString(36).slice(2)}`;

      const intervals = [
        makeInterval({ id: "int-a1", connectionId: connA, startAtDaysFromNow: 1 }),
        makeInterval({ id: "int-b1", connectionId: connB, startAtDaysFromNow: 2 }),
      ];
      await repo.upsertBatch(intervals);

      await repo.upsertBatch([
        makeInterval({ id: "int-a2", connectionId: connA, startAtDaysFromNow: 3 }),
      ]);

      const all = await repo.findByUserIdAndDateRange(
        "user-contract",
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );

      const connBIntervals = all.filter((i) => i.connectionId === connB);
      expect(connBIntervals).toHaveLength(1);
      expect(connBIntervals[0]?.id).toBe("int-b1");
    });

    it("upsertBatch updates existing intervals with same id within same connectionId", async () => {
      const repo = getImportedBusyIntervalRepository();
      const connId = `conn-update-${Math.random().toString(36).slice(2)}`;

      await repo.upsertBatch([
        makeInterval({ id: "int-same", connectionId: connId, startAtDaysFromNow: 1 }),
      ]);

      const found = await repo.findByUserIdAndDateRange(
        "user-contract",
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );
      const existing = found.find((i) => i.id === "int-same");
      const updatedInterval: ImportedBusyIntervalRecord = {
        ...existing!,
        endAt: new Date(fixedNow.getTime() + 2 * 86400000 + 3600000 * 2),
      };

      await repo.upsertBatch([updatedInterval]);

      const afterUpdate = await repo.findByUserIdAndDateRange(
        "user-contract",
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );

      expect(afterUpdate).toHaveLength(1);
      expect(afterUpdate[0]?.endAt.getTime()).toBe(updatedInterval.endAt.getTime());
    });
  });

  describe("Postgres repository", () => {
    const fixedEnd = new Date(fixedNow.getTime() + 90 * 86400000);

    afterEach(async () => {
      if (postgresAvailable) {
        try {
          const cleanupRepo = createPostgresImportedBusyIntervalRepository();
          await cleanupRepo.deleteExpiredBefore(fixedEnd);
        } catch {
          // cleanup failures should not fail tests
        }
      }
    });

    it("upsertBatch replaces all intervals for a connectionId (not additive)", async function () {
      if (!postgresAvailable) {
        postgresAvailable = await isPostgresReachable();
      }
      if (!postgresAvailable || !schemaReady) {
        return; // skip
      }
      const repo = createPostgresImportedBusyIntervalRepository();
      const connId = "00000000-0000-0000-0000-000000000001";
      const userId = "00000000-0000-0000-0000-000000000001";

      const first: ImportedBusyIntervalRecord[] = [
        makeInterval({ id: "00000000-0000-0000-0000-000000000011", connectionId: connId, userId, startAtDaysFromNow: 1 }),
        makeInterval({ id: "00000000-0000-0000-0000-000000000012", connectionId: connId, userId, startAtDaysFromNow: 2 }),
      ];
      const second: ImportedBusyIntervalRecord[] = [
        makeInterval({ id: "00000000-0000-0000-0000-000000000013", connectionId: connId, userId, startAtDaysFromNow: 3 }),
      ];

      await repo.upsertBatch(first);
      await repo.upsertBatch(second);

      const found = await repo.findByUserIdAndDateRange(
        userId,
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );

      const ids = found.map((i) => i.id).sort();
      expect(ids).toEqual(["00000000-0000-0000-0000-000000000013"]);
    });

    it("upsertBatch with multiple connectionIds only replaces the specified connectionId", async function () {
      if (!postgresAvailable) {
        postgresAvailable = await isPostgresReachable();
      }
      if (!postgresAvailable || !schemaReady) {
        return; // skip
      }
      const repo = createPostgresImportedBusyIntervalRepository();
      const connA = "00000000-0000-0000-0000-000000000001";
      const connB = "00000000-0000-0000-0000-000000000002";
      const userId = "00000000-0000-0000-0000-000000000001";

      const intervals = [
        makeInterval({ id: "00000000-0000-0000-0000-000000000011", connectionId: connA, userId, startAtDaysFromNow: 1 }),
        makeInterval({ id: "00000000-0000-0000-0000-000000000012", connectionId: connB, userId, startAtDaysFromNow: 2 }),
      ];
      await repo.upsertBatch(intervals);

      await repo.upsertBatch([
        makeInterval({ id: "00000000-0000-0000-0000-000000000013", connectionId: connA, userId, startAtDaysFromNow: 3 }),
      ]);

      const all = await repo.findByUserIdAndDateRange(
        userId,
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );

      const connBIntervals = all.filter((i) => i.connectionId === connB);
      expect(connBIntervals).toHaveLength(1);
      expect(connBIntervals[0]?.id).toBe("00000000-0000-0000-0000-000000000012");
    });

    it("upsertBatch updates existing intervals with same id within same connectionId", async function () {
      if (!postgresAvailable) {
        postgresAvailable = await isPostgresReachable();
      }
      if (!postgresAvailable || !schemaReady) {
        return; // skip
      }
      const repo = createPostgresImportedBusyIntervalRepository();
      const connId = "00000000-0000-0000-0000-000000000003";
      const userId = "00000000-0000-0000-0000-000000000001";
      const intervalId = "00000000-0000-0000-0000-000000000011";

      await repo.upsertBatch([
        makeInterval({ id: intervalId, connectionId: connId, userId, startAtDaysFromNow: 1 }),
      ]);

      const found = await repo.findByUserIdAndDateRange(
        userId,
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );
      const existing = found.find((i) => i.id === intervalId);
      const updatedInterval: ImportedBusyIntervalRecord = {
        ...existing!,
        endAt: new Date(fixedNow.getTime() + 2 * 86400000 + 3600000 * 2),
      };

      await repo.upsertBatch([updatedInterval]);

      const afterUpdate = await repo.findByUserIdAndDateRange(
        userId,
        new Date(fixedNow.getTime() - 86400000),
        new Date(fixedNow.getTime() + 90 * 86400000),
      );

      expect(afterUpdate).toHaveLength(1);
      expect(afterUpdate[0]?.endAt.getTime()).toBe(updatedInterval.endAt.getTime());
    });
  });
});
