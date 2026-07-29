import {
  submitSearch,
  rerunSearch,
  type ActiveTopicsRepository,
  type ProfileRepository,
  type SearchInput,
  type SearchInputOverrides,
} from "../search/search-input";
import type { SearchRecord } from "../search/repository";
import {
  addCivilDays,
  isValidTimeZone,
  localDayNumber,
  startOfWeekInTimezone,
} from "../time";
import type { Result } from "../lib/result";
import { err, ok } from "../lib/result";
import type { SearchResultRepository } from "../search/search-result-repository";
import type { SearchSnapshot } from "../search/search-result-repository";
import {
  createDefaultSearchSnapshotAssemblerDeps,
  SearchSnapshotAssembler,
  type SearchSnapshotAssemblerDeps,
} from "../search/search-snapshot-assembler";
import type { DiscoverableUserRepository } from "../search/discoverable-user-repository";
import type { Clock } from "../system/clock";
import { getSearchRepository } from "../search/repository";
import { getTopicCatalogueRepository } from "../topics/repository";

export type SearchFormDefaults = {
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
};

export type SearchFormState = {
  defaults: SearchFormDefaults;
  profileTimezone: string | null;
};

export type SearchFieldErrorCode =
  | "selected_topics_required"
  | "topic_retired"
  | "minimum_out_of_range"
  | "duration_out_of_range"
  | "date_range_invalid"
  | "date_range_too_long"
  | "organizer_timezone_required";

export type SearchFieldErrors = {
  selectedTopics?: "selected_topics_required" | "topic_retired";
  minimumMatchingUsers?: "minimum_out_of_range";
  durationMinutes?: "duration_out_of_range";
  dateRangeEnd?: "date_range_invalid" | "date_range_too_long";
  organizerTimezone?: "organizer_timezone_required";
};

export type RunSearchOutcome = Result<
  { searchId: string },
  { fieldErrors: SearchFieldErrors }
>;

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

export type ListHistoryOutcome = Result<
  SearchHistoryPageItem[],
  {
    reason: "history_unavailable";
  }
>;

export type RerunSearchOutcome = Result<
  { searchId: string },
  {
    reason: "search_not_found" | "topics_invalid";
  }
>;

export type SearchWorkflow = {
  buildForm(input: { userId: string }): Promise<SearchFormState>;
  run(input: {
    userId: string;
    raw: SearchFormDefaults;
  }): Promise<RunSearchOutcome>;
  openSnapshot(input: {
    userId: string;
    searchId: string;
    isAdmin?: boolean;
  }): Promise<
    Result<
      {
        search: SearchRecord;
        snapshot: SearchSnapshot;
        selectedTopics: Array<{ id: string; name: string }>;
      },
      {
        reason: "search_not_found" | "snapshot_not_found";
      }
    >
  >;
  listHistory(input: { userId: string }): Promise<ListHistoryOutcome>;
  rerun(input: {
    userId: string;
    searchId: string;
  }): Promise<RerunSearchOutcome>;
};

export type CreateSearchWorkflowDeps = {
  clock: Clock;
  profileRepository: ProfileRepository;
  activeTopicsRepository: ActiveTopicsRepository;
  discoverableUserRepository: DiscoverableUserRepository;
  searchResultRepository: SearchResultRepository;
  assemblerDependencies?: SearchSnapshotAssemblerDeps;
};

export const MINIMUM_MATCHING_USERS_MIN = 2;
export const DURATION_MIN_MINUTES = 15;
export const DURATION_MAX_MINUTES = 240;
export const DATE_RANGE_WEEKS = 5;
export const DATE_RANGE_MAX_DAYS = 90;
export const DATE_RANGE_MAX_MS = DATE_RANGE_MAX_DAYS * 24 * 60 * 60 * 1000;

export function createSearchWorkflow(
  deps: CreateSearchWorkflowDeps,
): SearchWorkflow {
  const {
    clock,
    profileRepository,
    activeTopicsRepository,
    discoverableUserRepository,
    searchResultRepository,
    assemblerDependencies,
  } = deps;

  return {
    async buildForm({ userId }) {
      const profile = await profileRepository.findByUserId(userId);
      const profileTimezone = profile?.profileTimezone ?? null;
      const start = profile?.profileTimezone
        ? startOfWeekInTimezone(clock.now(), profile.profileTimezone)
        : startOfWeekInTimezone(clock.now(), "UTC");
      const end = addCivilDays(
        start,
        DATE_RANGE_WEEKS * 7,
        profile?.profileTimezone ?? "UTC",
      );
      const organizerTimezone = profile?.profileTimezone ?? "";

      const state: SearchFormState = {
        defaults: {
          selectedTopicIds: [],
          minimumMatchingUsers: MINIMUM_MATCHING_USERS_MIN,
          durationMinutes: 60,
          dateRangeStart: start,
          dateRangeEnd: end,
          organizerTimezone,
        },
        profileTimezone,
      };
      return state;
    },

    async run({ userId, raw }) {
      const rawErrors = validateRaw(raw);
      if (Object.keys(rawErrors).length > 0) {
        return { ok: false, error: { fieldErrors: rawErrors } };
      }

      const activeTopics = await activeTopicsRepository.listActive();
      const activeIds = new Set(activeTopics.map((topic) => topic.id));
      const selectedTopicIds = raw.selectedTopicIds;
      const missingFromActive = selectedTopicIds.filter(
        (topicId) => !activeIds.has(topicId),
      );
      if (missingFromActive.length > 0) {
        return {
          ok: false,
          error: { fieldErrors: { selectedTopics: "topic_retired" } },
        };
      }

      const overrides: SearchInputOverrides = {
        selectedTopicIds,
        minimumMatchingUsers: raw.minimumMatchingUsers,
        durationMinutes: raw.durationMinutes,
        dateRangeStart: raw.dateRangeStart,
        dateRangeEnd: raw.dateRangeEnd,
        organizerTimezone: raw.organizerTimezone,
      };

      const profile = await profileRepository.findByUserId(userId);
      const profileTimezone = profile?.profileTimezone ?? null;
      const organizerTimezone =
        raw.organizerTimezone.trim() || profileTimezone || "";
      if (!organizerTimezone) {
        return {
          ok: false,
          error: {
            fieldErrors: {
              organizerTimezone: "organizer_timezone_required",
            },
          },
        };
      }

      const effectiveAssemblerDependencies =
        assemblerDependencies ??
        createDefaultSearchSnapshotAssemblerDeps({
          discoverableUserRepository,
          topicRepository: {
            listActive: () => Promise.resolve(activeTopics),
          },
          profileRepository,
          clock: deps.clock,
        });
      const matchingPoolSize = (
        await new SearchSnapshotAssembler({
          ...effectiveAssemblerDependencies,
          topicRepository: {
            listActive: () => Promise.resolve(activeTopics),
          },
        }).listEligibleUserIds({
          organizerId: userId,
          selectedTopicIds,
          durationMinutes: raw.durationMinutes,
          dateRangeStart: raw.dateRangeStart,
          dateRangeEnd: raw.dateRangeEnd,
          organizerTimezone,
          minimumMatchingUsers: raw.minimumMatchingUsers,
          now: clock.now(),
        })
      ).length;

      if (
        matchingPoolSize < MINIMUM_MATCHING_USERS_MIN ||
        raw.minimumMatchingUsers > matchingPoolSize
      ) {
        return {
          ok: false,
          error: {
            fieldErrors: {
              minimumMatchingUsers: "minimum_out_of_range",
            },
          },
        };
      }

      const submitDeps: Parameters<typeof submitSearch>[0] = {
        organizerId: userId,
        activeTopicsRepository: {
          listActive: () => Promise.resolve(activeTopics),
        },
        profileRepository,
        discoverableUserRepository,
        searchResultRepository,
        clock,
        matchingPoolSize,
        activeTopicsSnapshot: activeTopics,
      };
      submitDeps.assemblerDependencies = effectiveAssemblerDependencies;

      const submitResult = await submitSearch(submitDeps, overrides);

      if (!submitResult.ok) {
        const fieldErrors = mapValidationErrors(submitResult.errors);
        return { ok: false, error: { fieldErrors } };
      }

      const searchId = submitResult.search.id;
      if (!searchId) {
        throw new Error("Persisted Search is missing its id.");
      }
      return { ok: true, value: { searchId } };
    },

    async openSnapshot(input: {
      userId: string;
      searchId: string;
      isAdmin?: boolean;
    }) {
      const { searchId } = input;
      const search = await getSearchRepository().findById(searchId);
      if (!search) {
        return err({ reason: "search_not_found" as const });
      }

      const result = await searchResultRepository.findBySearchId(searchId);
      if (!result) {
        return err({ reason: "snapshot_not_found" as const });
      }

      const catalogue = await getTopicCatalogueRepository().listCatalogue();
      const selectedTopics = search.selectedTopicIds.flatMap((topicId) => {
        const topic = catalogue.find((entry) => entry.id === topicId);
        return topic
          ? [{ id: topic.id, name: topic.name }]
          : [{ id: topicId, name: topicId }];
      });

      return ok({
        search,
        snapshot: result.snapshotJson,
        selectedTopics,
      });
    },

    async listHistory({
      userId,
    }: {
      userId: string;
    }): Promise<ListHistoryOutcome> {
      // The history is shared by every Organizer and Admin; userId is part of
      // the workflow contract but is not used as a filter. Reserved for any
      // future per-caller scoping (e.g. audit trail).
      void userId;
      try {
        const raw = await getSearchRepository().listSearchHistory(clock);
        const catalogue = await getTopicCatalogueRepository().listCatalogue();
        const topicNamesById = new Map(
          catalogue.map((entry) => [entry.id, entry.name] as const),
        );
        const page: SearchHistoryPageItem[] = [];
        for (const item of raw) {
          const profile = await profileRepository.findByUserId(
            item.organizerId,
          );
          const displayName =
            profile?.displayName?.trim() &&
            profile.displayName.trim().length > 0
              ? profile.displayName.trim()
              : item.organizerId;
          const selectedTopicNames = item.selectedTopicIds.map(
            (topicId) => topicNamesById.get(topicId) ?? topicId,
          );
          page.push({
            id: item.id,
            organizerId: item.organizerId,
            organizerDisplayName: displayName,
            selectedTopicIds: item.selectedTopicIds,
            selectedTopicNames,
            minimumMatchingUsers: item.minimumMatchingUsers,
            durationMinutes: item.durationMinutes,
            dateRangeStart: item.dateRangeStart,
            dateRangeEnd: item.dateRangeEnd,
            organizerTimezone: item.organizerTimezone,
            generatedAt: item.generatedAt,
            snapshotId: item.snapshotId,
            stale: item.stale,
          });
        }
        return ok(page);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") {
          throw caught;
        }
        return err({ reason: "history_unavailable" });
      }
    },

    async rerun(input: {
      userId: string;
      searchId: string;
    }): Promise<RerunSearchOutcome> {
      const { userId, searchId } = input;
      const activeTopics = await activeTopicsRepository.listActive();
      const result = await rerunSearch(
        searchId,
        {
          discoverableUserRepository,
          clock,
          searchResultRepository,
          topicRepository: {
            listActive: () => Promise.resolve(activeTopics),
          },
          profileRepository,
          assemblerDependencies,
        },
        { actingOrganizerId: userId },
      );
      if (!result.ok) {
        if (result.reason === "not_found") {
          return err({ reason: "search_not_found" });
        }
        return err({ reason: "topics_invalid" });
      }
      const persistedId = result.search.id;
      if (!persistedId) {
        throw new Error("Persisted Search is missing its id after rerun.");
      }
      return ok({ searchId: persistedId });
    },
  };
}

function hasOrganizerTimezone(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRaw(raw: SearchFormDefaults): SearchFieldErrors {
  const errors: SearchFieldErrors = {};
  const organizerTimezone =
    typeof raw.organizerTimezone === "string"
      ? raw.organizerTimezone.trim()
      : "";
  const selectedTopicIds = Array.isArray(raw.selectedTopicIds)
    ? raw.selectedTopicIds.filter((id): id is string => typeof id === "string")
    : [];
  if (selectedTopicIds.length === 0) {
    errors.selectedTopics = "selected_topics_required";
  }

  const minimum = Number(raw.minimumMatchingUsers);
  if (!Number.isInteger(minimum) || minimum < MINIMUM_MATCHING_USERS_MIN) {
    errors.minimumMatchingUsers = "minimum_out_of_range";
  }

  const duration = Number(raw.durationMinutes);
  if (
    !Number.isFinite(duration) ||
    duration < DURATION_MIN_MINUTES ||
    duration > DURATION_MAX_MINUTES
  ) {
    errors.durationMinutes = "duration_out_of_range";
  }

  const start = raw.dateRangeStart instanceof Date ? raw.dateRangeStart : null;
  const end = raw.dateRangeEnd instanceof Date ? raw.dateRangeEnd : null;
  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    errors.dateRangeEnd = "date_range_invalid";
  } else if (end.getTime() <= start.getTime()) {
    errors.dateRangeEnd = "date_range_invalid";
  } else if (hasOrganizerTimezone(organizerTimezone)) {
    try {
      isValidTimeZone(organizerTimezone);
      if (
        localDayNumber(end, organizerTimezone) -
          localDayNumber(start, organizerTimezone) >
        DATE_RANGE_MAX_DAYS
      ) {
        errors.dateRangeEnd = "date_range_too_long";
      }
    } catch {
      // timezone is invalid; the field error is captured below
    }
  }

  if (!organizerTimezone) {
    errors.organizerTimezone = "organizer_timezone_required";
  }

  return errors;
}

function mapValidationErrors(
  errors: ReadonlyArray<{ field: keyof SearchInput; message: string }>,
): SearchFieldErrors {
  const out: SearchFieldErrors = {};
  for (const { field } of errors) {
    if (field === "selectedTopicIds") {
      out.selectedTopics = "selected_topics_required";
    } else if (field === "minimumMatchingUsers") {
      out.minimumMatchingUsers = "minimum_out_of_range";
    } else if (field === "durationMinutes") {
      out.durationMinutes = "duration_out_of_range";
    } else if (field === "dateRangeStart" || field === "dateRangeEnd") {
      out.dateRangeEnd = "date_range_invalid";
    } else if (field === "organizerTimezone") {
      out.organizerTimezone = "organizer_timezone_required";
    }
  }
  return out;
}
