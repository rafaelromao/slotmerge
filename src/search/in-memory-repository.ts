import { randomUUID } from "node:crypto";

import type { Clock } from "../system/clock";
import type {
  SearchHistoryItem,
  SearchRecord,
  SearchRepository,
} from "./repository";
import { deriveSearchSnapshotStaleness } from "./match-detail";

export class InMemorySearchRepository implements SearchRepository {
  private readonly byId = new Map<string, SearchRecord>();
  private readonly snapshotIdsBySearchId = new Map<string, string>();

  async save(record: SearchRecord): Promise<SearchRecord> {
    await Promise.resolve();
    const stored: SearchRecord = {
      ...record,
      id: record.id ?? randomUUID(),
    };
    this.byId.set(stored.id as string, stored);
    return stored;
  }

  async findById(id: string): Promise<SearchRecord | null> {
    await Promise.resolve();
    return this.byId.get(id) ?? null;
  }

  async listByOrganizer(organizerId: string): Promise<SearchRecord[]> {
    await Promise.resolve();
    return Array.from(this.byId.values())
      .filter((r) => r.organizerId === organizerId)
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  }
  async listAll(): Promise<SearchRecord[]> {
    await Promise.resolve();
    return Array.from(this.byId.values()).sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime(),
    );
  }

  async listSearchHistory(clock: Clock): Promise<SearchHistoryItem[]> {
    await Promise.resolve();
    const searches = Array.from(this.byId.values()).sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime(),
    );
    const now = clock.now();

    return searches
      .map((s): SearchHistoryItem | null => {
        if (!s.id) return null;
        const snapshotId = this.snapshotIdsBySearchId.get(s.id);
        if (!snapshotId) return null;
        return {
          id: s.id,
          organizerId: s.organizerId,
          selectedTopicIds: s.selectedTopicIds,
          minimumMatchingUsers: s.minimumMatchingUsers,
          durationMinutes: s.durationMinutes,
          dateRangeStart: s.dateRangeStart,
          dateRangeEnd: s.dateRangeEnd,
          organizerTimezone: s.organizerTimezone,
          generatedAt: s.generatedAt,
          snapshotId,
          stale: deriveSearchSnapshotStaleness(s.generatedAt, now),
        };
      })
      .filter((item): item is SearchHistoryItem => item !== null);
  }

  setSnapshotId(searchId: string, snapshotId: string): void {
    this.snapshotIdsBySearchId.set(searchId, snapshotId);
  }
}
