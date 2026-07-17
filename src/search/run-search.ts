import type { SearchInput } from "./search-input";
import type { Clock } from "../system/clock";
import type { SearchRecord } from "./repository";
import type {
  SearchResultRecord,
  SearchSnapshot,
} from "./search-result-repository";

import {
  SearchSnapshotAssembler,
  type SearchSnapshotAssemblerDeps,
} from "./search-snapshot-assembler";

import type { SearchResultRepository } from "./search-result-repository";

export type RunSearchDeps = {
  assemblerDependencies: SearchSnapshotAssemblerDeps;
  searchResultRepository: SearchResultRepository;
};

export type RunSearchParams = {
  searchRecord: SearchRecord;
  input: SearchInput;
  generatedAt: Date;
};

export async function runSearch(
  params: RunSearchParams,
  deps: RunSearchDeps,
): Promise<SearchResultRecord> {
  const { searchRecord, input, generatedAt } = params;
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
    now: generatedAt,
  });

  const resultRecord: SearchResultRecord = {
    searchId: searchRecord.id!,
    snapshotJson: snapshot,
    createdAt: generatedAt,
  };

  return searchResultRepository.save(resultRecord);
}
