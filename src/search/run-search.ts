import type { Clock } from "./search-input";
import type { SearchInput } from "./search-input";
import type { SearchRecord } from "./repository";
import type {
  SearchResultRecord,
  SearchSnapshot,
} from "./search-result-repository";

import {
  SearchSnapshotAssembler,
  type SearchSnapshotAssemblerDeps,
} from "./search-snapshot-assembler";

import type { DiscoverableUserRepository } from "./discoverable-user-repository";
import type { SearchResultRepository } from "./search-result-repository";

export type RunSearchDeps = {
  assemblerDependencies: SearchSnapshotAssemblerDeps;
  discoverableUserRepository: DiscoverableUserRepository;
  clock: Clock;
  searchResultRepository: SearchResultRepository;
};

export type RunSearchParams = {
  searchRecord: SearchRecord;
  input: SearchInput;
};

export async function runSearch(
  params: RunSearchParams,
  deps: RunSearchDeps,
): Promise<SearchResultRecord> {
  const { searchRecord, input } = params;
  const { searchResultRepository, assemblerDependencies } = deps;

  const assembler = new SearchSnapshotAssembler(assemblerDependencies);

  const snapshot: SearchSnapshot = await assembler.assemble({
    organizerId: input.organizerId,
    selectedTopicIds: input.selectedTopicIds,
    durationMinutes: input.durationMinutes ?? 60,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    organizerTimezone: input.organizerTimezone,
    minimumMatchingUsers: input.minimumMatchingUsers,
  });

  const resultRecord: SearchResultRecord = {
    searchId: searchRecord.id!,
    snapshotJson: snapshot,
    createdAt: new Date(snapshot.generatedAt),
  };

  return searchResultRepository.save(resultRecord);
}
