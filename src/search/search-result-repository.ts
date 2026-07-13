import type {
  SearchSnapshot as SchemaSearchSnapshot,
  CalendarFreshness as SchemaCalendarFreshness,
  AvailabilityIndicator as SchemaAvailabilityIndicator,
} from "../db/schema";

export type SearchSnapshot = SchemaSearchSnapshot;
export type CalendarFreshness = SchemaCalendarFreshness;
export type AvailabilityIndicator = SchemaAvailabilityIndicator;

export type SearchResultRecord = {
  id?: string;
  searchId: string;
  snapshotJson: SearchSnapshot;
  createdAt: Date;
};

export type SearchResultRepository = {
  save(record: SearchResultRecord): Promise<SearchResultRecord>;
  findById(id: string): Promise<SearchResultRecord | null>;
  findBySearchId(searchId: string): Promise<SearchResultRecord | null>;
};

let repositoryOverride: SearchResultRepository | null = null;

export function setSearchResultRepositoryForTests(
  repository: SearchResultRepository | null,
) {
  repositoryOverride = repository;
}

export function getSearchResultRepository(): SearchResultRepository {
  return repositoryOverride ?? createPostgresSearchResultRepository();
}

import { createPostgresSearchResultRepository } from "./drizzle-search-result-repository";
