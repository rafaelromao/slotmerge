import type { BusyIntervalStatus } from "../db/schema";

export const ROLLING_WINDOW_DAYS = 90;

export function isWithinRollingWindow(startAt: Date): boolean {
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return startAt >= now && startAt <= windowEnd;
}

export type ImportedBusyIntervalRecord = {
  id: string;
  userId: string;
  connectionId: string;
  providerCalendarId: string;
  providerEventReference: string | null;
  status: BusyIntervalStatus;
  startAt: Date;
  endAt: Date;
  importedAt: Date;
};

export type ImportedBusyIntervalRepository = {
  upsertBatch(intervals: ImportedBusyIntervalRecord[]): Promise<void>;
  deleteByConnectionId(connectionId: string): Promise<void>;
  findByUserIdAndDateRange(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<ImportedBusyIntervalRecord[]>;
  deleteExpiredBefore(before: Date): Promise<number>;
};

let repositoryOverride: ImportedBusyIntervalRepository | null = null;

export function setImportedBusyIntervalRepositoryForTests(
  repository: ImportedBusyIntervalRepository | null,
) {
  repositoryOverride = repository;
}

export function getImportedBusyIntervalRepository(): ImportedBusyIntervalRepository {
  return repositoryOverride ?? inMemoryImportedBusyIntervalRepository;
}

const inMemoryImportedBusyIntervalRepository: ImportedBusyIntervalRepository = {
  async upsertBatch(intervals) {
    const filtered = intervals.filter((i) => isWithinRollingWindow(i.startAt));
    if (filtered.length === 0) return;

    const connectionIds = [...new Set(filtered.map((i) => i.connectionId))];
    for (const connectionId of connectionIds) {
      inMemoryStore = inMemoryStore.filter(
        (i) => i.connectionId !== connectionId,
      );
    }

    inMemoryStore.push(...filtered);
    await Promise.resolve();
  },
  async deleteByConnectionId(connectionId) {
    inMemoryStore = inMemoryStore.filter(
      (i) => i.connectionId !== connectionId,
    );
    await Promise.resolve();
  },
  async findByUserIdAndDateRange(userId, start, end) {
    return Promise.resolve(
      inMemoryStore.filter(
        (i) => i.userId === userId && i.startAt >= start && i.startAt <= end,
      ),
    );
  },
  async deleteExpiredBefore(before) {
    const expired = inMemoryStore.filter((i) => i.startAt < before);
    const deletedCount = expired.length;
    inMemoryStore = inMemoryStore.filter((i) => i.startAt >= before);
    return Promise.resolve(deletedCount);
  },
};

let inMemoryStore: ImportedBusyIntervalRecord[] = [];

export function clearInMemoryImportedBusyIntervalStore() {
  inMemoryStore = [];
}
