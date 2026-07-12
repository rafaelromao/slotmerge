import type { SearchRepository } from "./drizzle-repository";

export type { SearchRecord, SearchRepository } from "./drizzle-repository";

export { createPostgresSearchRepository } from "./drizzle-repository";

import { createPostgresSearchRepository } from "./drizzle-repository";

let repositoryOverride: SearchRepository | null = null;

export function setSearchRepositoryForTests(
  repository: SearchRepository | null,
) {
  repositoryOverride = repository;
}

export function clearSearchRepositoryOverride() {
  repositoryOverride = null;
}

export function getSearchRepository(): SearchRepository {
  return repositoryOverride ?? createPostgresSearchRepository();
}
