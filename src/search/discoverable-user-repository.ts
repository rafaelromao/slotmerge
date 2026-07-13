export type DiscoverableUserRepository = {
  listDiscoverableUserIds(selectedTopicIds: string[]): Promise<string[]>;
};

let repositoryOverride: DiscoverableUserRepository | null = null;

export function setDiscoverableUserRepositoryForTests(
  repository: DiscoverableUserRepository | null,
) {
  repositoryOverride = repository;
}

export function getDiscoverableUserRepository(): DiscoverableUserRepository {
  return repositoryOverride ?? createPostgresDiscoverableUserRepository();
}

import { createPostgresDiscoverableUserRepository } from "./drizzle-discoverable-user-repository";
