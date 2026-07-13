import { randomUUID } from "node:crypto";

import type { SearchRecord, SearchRepository } from "./repository";

export class InMemorySearchRepository implements SearchRepository {
  private readonly byId = new Map<string, SearchRecord>();

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
}
