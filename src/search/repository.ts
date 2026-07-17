export type SearchRecord = {
  id?: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number | null;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
  generatedAt: Date;
  snapshotReference?: string;
};

export type SearchHistoryItem = {
  id: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number | null;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
  generatedAt: Date;
  snapshotId: string;
  stale: boolean;
};

export type SearchRepository = {
  save(record: SearchRecord): Promise<SearchRecord>;
  findById(id: string): Promise<SearchRecord | null>;
  listByOrganizer(organizerId: string): Promise<SearchRecord[]>;
  listSearchHistory(options?: { clock?: { now: () => Date } }): Promise<SearchHistoryItem[]>;
  listAll(): Promise<SearchRecord[]>;
};

import { createPostgresSearchRepository } from "./drizzle-repository";

let repositoryOverride: SearchRepository | null = null;

export function setSearchRepositoryForTests(
  repository: SearchRepository | null,
) {
  repositoryOverride = repository;
}

const defaultSearchRepository: SearchRepository =
  createPostgresSearchRepository();

export function getSearchRepository(): SearchRepository {
  return repositoryOverride ?? defaultSearchRepository;
}
