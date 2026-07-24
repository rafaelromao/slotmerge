import {
  startOfWeekInTimezone,
  submitSearch,
  type ActiveTopicsRepository,
  type ProfileRepository,
  type SearchInput,
  type SearchInputOverrides,
} from "../search/search-input";
import type { Result } from "../lib/result";
import type { SearchResultRepository } from "../search/search-result-repository";
import type { SearchSnapshotAssemblerDeps } from "../search/search-snapshot-assembler";
import type { DiscoverableUserRepository } from "../search/discoverable-user-repository";
import type { Clock } from "../system/clock";

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

export type SearchWorkflow = {
  buildForm(input: { userId: string }): Promise<SearchFormState>;
  run(input: {
    userId: string;
    raw: SearchFormDefaults;
  }): Promise<RunSearchOutcome>;
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
      const end = new Date(
        start.getTime() + DATE_RANGE_WEEKS * 7 * 24 * 60 * 60 * 1000,
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

      const matchingPoolUserIds =
        await discoverableUserRepository.listDiscoverableUserIds(
          selectedTopicIds,
        );
      const matchingPoolSize = matchingPoolUserIds.length;

      if (matchingPoolSize < MINIMUM_MATCHING_USERS_MIN) {
        return {
          ok: false,
          error: {
            fieldErrors: {
              minimumMatchingUsers: "minimum_out_of_range",
            },
          },
        };
      }

      if (raw.minimumMatchingUsers > matchingPoolSize) {
        return {
          ok: false,
          error: {
            fieldErrors: {
              minimumMatchingUsers: "minimum_out_of_range",
            },
          },
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

      const submitDeps: Parameters<typeof submitSearch>[0] = {
        organizerId: userId,
        activeTopicsRepository,
        profileRepository,
        discoverableUserRepository,
        searchResultRepository,
        clock,
        matchingPoolSize,
      };
      if (assemblerDependencies !== undefined) {
        submitDeps.assemblerDependencies = assemblerDependencies;
      }

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
  };
}

function validateRaw(raw: SearchFormDefaults): SearchFieldErrors {
  const errors: SearchFieldErrors = {};
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
  } else if (end.getTime() - start.getTime() > DATE_RANGE_MAX_MS) {
    errors.dateRangeEnd = "date_range_too_long";
  }

  const organizerTimezone =
    typeof raw.organizerTimezone === "string"
      ? raw.organizerTimezone.trim()
      : "";
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
