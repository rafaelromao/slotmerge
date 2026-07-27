import type { SearchRecord } from "../search/repository";
import type { SearchSnapshot } from "../search/search-result-repository";

export type SearchHistoryPageItem = {
  id: string;
  organizerId: string;
  organizerDisplayName: string;
  selectedTopicIds: string[];
  selectedTopicNames: string[];
  minimumMatchingUsers: number;
  durationMinutes: number | null;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
  generatedAt: Date;
  snapshotId: string;
  stale: boolean;
};

export type SearchHistoryPageDto = {
  history: Array<{
    id: string;
    organizerId: string;
    organizerDisplayName: string;
    selectedTopicIds: string[];
    selectedTopicNames: string[];
    minimumMatchingUsers: number;
    durationMinutes: number | null;
    dateRangeStart: string;
    dateRangeEnd: string;
    organizerTimezone: string;
    generatedAt: string;
    snapshotId: string;
    stale: boolean;
  }>;
};

export function serializeSearchHistoryPage(
  history: SearchHistoryPageItem[],
): SearchHistoryPageDto {
  return {
    history: history.map((item) => ({
      id: item.id,
      organizerId: item.organizerId,
      organizerDisplayName: item.organizerDisplayName,
      selectedTopicIds: [...item.selectedTopicIds],
      selectedTopicNames: [...item.selectedTopicNames],
      minimumMatchingUsers: item.minimumMatchingUsers,
      durationMinutes: item.durationMinutes,
      dateRangeStart: item.dateRangeStart.toISOString(),
      dateRangeEnd: item.dateRangeEnd.toISOString(),
      organizerTimezone: item.organizerTimezone,
      generatedAt: item.generatedAt.toISOString(),
      snapshotId: item.snapshotId,
      stale: item.stale,
    })),
  };
}

export type SearchSnapshotDtoSearch = {
  id: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number | null;
  dateRangeStart: string;
  dateRangeEnd: string;
  organizerTimezone: string;
  generatedAt: string;
};

export type SearchSnapshotDto = {
  search: SearchSnapshotDtoSearch;
  snapshot: SearchSnapshot;
  selectedTopics: Array<{ id: string; name: string }>;
};

export type SearchSnapshotOpenedValue = {
  search: SearchRecord;
  snapshot: SearchSnapshot;
  selectedTopics: Array<{ id: string; name: string }>;
};

export function serializeSearchSnapshot(
  opened: SearchSnapshotOpenedValue,
): SearchSnapshotDto {
  const id = opened.search.id;

  if (!id) {
    throw new Error("Persisted Search id is missing from openSnapshot result.");
  }

  return {
    search: {
      id,
      organizerId: opened.search.organizerId,
      selectedTopicIds: [...opened.search.selectedTopicIds],
      minimumMatchingUsers: opened.search.minimumMatchingUsers,
      durationMinutes: opened.search.durationMinutes,
      dateRangeStart: opened.search.dateRangeStart.toISOString(),
      dateRangeEnd: opened.search.dateRangeEnd.toISOString(),
      organizerTimezone: opened.search.organizerTimezone,
      generatedAt: opened.search.generatedAt.toISOString(),
    },
    snapshot: opened.snapshot,
    selectedTopics: opened.selectedTopics.map((topic) => ({
      id: topic.id,
      name: topic.name,
    })),
  };
}

export type SetupStatusItem = {
  key: string;
  label: string;
  required: boolean;
  complete: boolean;
};

export type SetupStatusSummary = {
  complete: boolean;
  items: SetupStatusItem[];
};

export type SetupStatusDto = {
  complete: boolean;
  items: SetupStatusItem[];
};

export function serializeSetupStatus(
  summary: SetupStatusSummary,
): SetupStatusDto {
  return {
    complete: summary.complete,
    items: summary.items.map((item) => ({ ...item })),
  };
}
