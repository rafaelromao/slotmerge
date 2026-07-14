import { randomUUID } from "node:crypto";

import type {
  SearchResultRecord,
  SearchResultRepository,
} from "./search-result-repository";

export class InMemorySearchResultRepository implements SearchResultRepository {
  private readonly byId = new Map<string, SearchResultRecord>();
  private readonly bySearchId = new Map<string, SearchResultRecord>();

  async save(record: SearchResultRecord): Promise<SearchResultRecord> {
    await Promise.resolve();
    const stored: SearchResultRecord = {
      ...record,
      id: record.id ?? randomUUID(),
    };
    this.byId.set(stored.id as string, stored);
    this.bySearchId.set(stored.searchId, stored);
    return stored;
  }

  async findById(id: string): Promise<SearchResultRecord | null> {
    await Promise.resolve();
    return this.byId.get(id) ?? null;
  }

  async findBySearchId(searchId: string): Promise<SearchResultRecord | null> {
    await Promise.resolve();
    return this.bySearchId.get(searchId) ?? null;
  }
}
