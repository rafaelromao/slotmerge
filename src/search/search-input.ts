import type { UserProfile } from "../profile/repository";

import { getSearchRepository, type SearchRecord } from "./repository";

export type Clock = {
  now(): Date;
};

export type ActiveTopic = {
  id: string;
  name: string;
  status: "active";
};

export type ActiveTopicsRepository = {
  listActive(): Promise<ActiveTopic[]>;
};

export type ProfileRepository = {
  findByUserId(userId: string): Promise<UserProfile | null>;
};

export type SearchInputOverrides = {
  selectedTopicIds?: string[];
  minimumMatchingUsers?: number;
  durationMinutes?: number | null;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  organizerTimezone?: string;
};

export type SearchInput = {
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number | null;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  organizerTimezone: string;
};

export type SearchInputBuilder = {
  build(overrides: SearchInputOverrides): Promise<SearchInput>;
  activeTopics(): Promise<ActiveTopic[]>;
};

export type SearchInputBuilderDeps = {
  organizerId: string;
  activeTopicsRepository: ActiveTopicsRepository;
  profileRepository: ProfileRepository;
  clock: Clock;
};

export function createSearchInputBuilder(
  deps: SearchInputBuilderDeps,
): SearchInputBuilder {
  return {
    async activeTopics(): Promise<ActiveTopic[]> {
      return deps.activeTopicsRepository.listActive();
    },
    async build(overrides: SearchInputOverrides): Promise<SearchInput> {
      const profile = await deps.profileRepository.findByUserId(
        deps.organizerId,
      );
      const timezone =
        overrides.organizerTimezone ?? profile?.profileTimezone ?? "UTC";

      const activeTopicIds = new Set(
        (await deps.activeTopicsRepository.listActive()).map((t) => t.id),
      );

      const requestedTopicIds = overrides.selectedTopicIds ?? [];
      for (const id of requestedTopicIds) {
        if (!activeTopicIds.has(id)) {
          throw new Error(
            `Topic ${id} is not in the active Topics catalogue and cannot be used in a Search.`,
          );
        }
      }

      const startOfRange =
        overrides.dateRangeStart ??
        startOfWeekInTimezone(deps.clock.now(), timezone);

      const endOfRange =
        overrides.dateRangeEnd ??
        new Date(startOfRange.getTime() + 5 * 7 * 24 * 60 * 60 * 1000);

      return {
        organizerId: deps.organizerId,
        selectedTopicIds: requestedTopicIds,
        minimumMatchingUsers: overrides.minimumMatchingUsers ?? 2,
        durationMinutes: overrides.durationMinutes ?? 60,
        dateRangeStart: startOfRange,
        dateRangeEnd: endOfRange,
        organizerTimezone: timezone,
      };
    },
  };
}

export function startOfWeekInTimezone(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));

  const offsetMs =
    Date.UTC(year, month - 1, day, hour, minute, second) - date.getTime();
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;

  const weekdayIndex =
    weekday === "Mon"
      ? 1
      : weekday === "Tue"
        ? 2
        : weekday === "Wed"
          ? 3
          : weekday === "Thu"
            ? 4
            : weekday === "Fri"
              ? 5
              : weekday === "Sat"
                ? 6
                : 0;
  const daysSinceMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1;

  return new Date(localMidnightAsUtc - daysSinceMonday * 86400000);
}

export type SearchInputError = {
  field: keyof SearchInput;
  message: string;
};

export type SearchInputValidationResult =
  { ok: true } | { ok: false; errors: SearchInputError[] };

export type SearchInputValidationDeps = {
  matchingPoolSize: number;
};

const IANA_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

function isValidIanaTimezone(value: string): boolean {
  if (!IANA_ZONE_PATTERN.test(value)) {
    return false;
  }
  try {
    const resolved = new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
    return resolved === value;
  } catch {
    return false;
  }
}

function isMinuteAligned(date: Date): boolean {
  return (
    date.getUTCMilliseconds() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMinutes() === 0
  );
}

export function validateSearchInput(
  input: SearchInput,
  deps: SearchInputValidationDeps,
): SearchInputValidationResult {
  const errors: SearchInputError[] = [];

  if (input.selectedTopicIds.length === 0) {
    errors.push({
      field: "selectedTopicIds",
      message: "Select at least one active Topic.",
    });
  }

  if (input.minimumMatchingUsers < 2) {
    errors.push({
      field: "minimumMatchingUsers",
      message: "Minimum matching Users must be at least 2.",
    });
  } else if (input.minimumMatchingUsers > deps.matchingPoolSize) {
    errors.push({
      field: "minimumMatchingUsers",
      message: `Minimum matching Users cannot exceed the matching pool size (${deps.matchingPoolSize}).`,
    });
  }

  if (input.durationMinutes === null) {
    errors.push({
      field: "durationMinutes",
      message: "Meeting duration is required.",
    });
  } else if (input.durationMinutes <= 0) {
    errors.push({
      field: "durationMinutes",
      message: "Meeting duration must be greater than zero.",
    });
  }

  if (!isMinuteAligned(input.dateRangeStart)) {
    errors.push({
      field: "dateRangeStart",
      message: "Date range start must align to whole minutes (:00 seconds).",
    });
  }
  if (!isMinuteAligned(input.dateRangeEnd)) {
    errors.push({
      field: "dateRangeEnd",
      message: "Date range end must align to whole minutes (:00 seconds).",
    });
  }
  if (input.dateRangeEnd.getTime() <= input.dateRangeStart.getTime()) {
    errors.push({
      field: "dateRangeEnd",
      message: "Date range end must be after the start.",
    });
  }

  if (!isValidIanaTimezone(input.organizerTimezone)) {
    errors.push({
      field: "organizerTimezone",
      message: "Organizer timezone must be a valid IANA zone.",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

export type SubmitSearchDeps = SearchInputBuilderDeps & {
  matchingPoolSize: number;
};

export type SubmitSearchOverrides = SearchInputOverrides;

export type SubmitSearchResult =
  | { ok: true; search: SearchRecord }
  | {
      ok: false;
      reason: "validation_failed";
      errors: SearchInputError[];
    };

export async function submitSearch(
  deps: SubmitSearchDeps,
  overrides: SubmitSearchOverrides = {},
): Promise<SubmitSearchResult> {
  const builder = createSearchInputBuilder(deps);
  const input = await builder.build(overrides);
  const validation = validateSearchInput(input, {
    matchingPoolSize: deps.matchingPoolSize,
  });
  if (!validation.ok) {
    return {
      ok: false,
      reason: "validation_failed",
      errors: validation.errors,
    };
  }

  const record: SearchRecord = {
    organizerId: input.organizerId,
    selectedTopicIds: input.selectedTopicIds,
    minimumMatchingUsers: input.minimumMatchingUsers,
    durationMinutes: input.durationMinutes,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
    organizerTimezone: input.organizerTimezone,
    generatedAt: deps.clock.now(),
  };

  const stored = await getSearchRepository().save(record);
  return { ok: true, search: stored };
}
