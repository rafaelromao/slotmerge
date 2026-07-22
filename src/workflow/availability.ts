import { ok, err, type Result } from "../lib/result";
import {
  type WeeklyAvailabilityWindow,
  type CreateWeeklyAvailabilityWindow,
  addWeeklyAvailabilityWindow,
  listWeeklyAvailabilityWindowsByUserId,
  findWeeklyAvailabilityWindowById,
  removeWeeklyAvailabilityWindowById,
} from "../profile/availability-windows";
import {
  type AvailabilityOverride,
  type CreateAvailabilityOverride,
  addAvailabilityOverride,
  listAvailabilityOverridesByUserId,
  removeAvailabilityOverrideById,
} from "../profile/availability-overrides";
import { getProfileByUserId, type UserProfile } from "../profile/repository";
import {
  computeEffectiveAvailability,
  type Interval,
} from "../matching/effective-availability";

export type AvailabilityDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type AvailabilityWindowFieldErrorCode =
  | "end_before_start"
  | "overlap_existing_window"
  | "outside_day"
  | "invalid_time"
  | "profile_timezone_required";

export type AvailabilityOverrideFieldErrorCode =
  | "date_required"
  | "end_before_start"
  | "invalid_time"
  | "profile_timezone_required";

export type AvailabilityWindowErrorCode =
  AvailabilityWindowFieldErrorCode | "not_found";

export type AvailabilityOverrideErrorCode =
  AvailabilityOverrideFieldErrorCode | "not_found";

export type AvailabilityWindowErrorField =
  "dayOfWeek" | "startTime" | "endTime" | "profileTimezone";

export type AvailabilityOverrideErrorField =
  "date" | "startTime" | "endTime" | "type" | "profileTimezone";

export type AvailabilityWindowError = {
  code: AvailabilityWindowErrorCode;
  field: AvailabilityWindowErrorField;
};

export type AvailabilityOverrideError = {
  code: AvailabilityOverrideErrorCode;
  field: AvailabilityOverrideErrorField;
};

export type PageLoadError = {
  code: "profile_timezone_required";
};

export type WindowPreviewInterval = {
  startTime: string;
  endTime: string;
};

export type WindowPreviewLine = {
  date: string;
  dayOfWeek: number;
  intervals: string[];
};

export type AvailabilityPageState = {
  profileTimezone: string;
  bufferMinutes: number;
  windowsByDay: Record<number, WeeklyAvailabilityWindow[]>;
  overrides: AvailabilityOverride[];
  previewLines: WindowPreviewLine[];
};

export type AvailabilityWorkflow = {
  loadPageState(input: {
    userId: string;
    now: Date;
  }): Promise<Result<AvailabilityPageState, PageLoadError>>;
  addWindow(input: {
    userId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    profileTimezone: string;
  }): Promise<
    Result<{ window: WeeklyAvailabilityWindow }, AvailabilityWindowError>
  >;
  removeWindow(input: {
    userId: string;
    windowId: string;
  }): Promise<Result<{ windowId: string }, { code: "not_found" }>>;
  addOverride(input: {
    userId: string;
    date: string;
    startTime: string;
    endTime: string;
    type: "add" | "block";
    profileTimezone: string;
  }): Promise<
    Result<{ override: AvailabilityOverride }, AvailabilityOverrideError>
  >;
  removeOverride(input: {
    userId: string;
    overrideId: string;
  }): Promise<Result<{ overrideId: string }, { code: "not_found" }>>;
  validateBuffer(input: {
    bufferMinutes: number;
  }): Result<{ bufferMinutes: number }, { code: "invalid_buffer" }>;
};

export type CreateAvailabilityWorkflowDeps = {
  listWindows?: typeof listWeeklyAvailabilityWindowsByUserId;
  addWindow?: typeof addWeeklyAvailabilityWindow;
  findWindow?: typeof findWeeklyAvailabilityWindowById;
  removeWindowById?: typeof removeWeeklyAvailabilityWindowById;
  listOverrides?: typeof listAvailabilityOverridesByUserId;
  addOverride?: typeof addAvailabilityOverride;
  removeOverrideById?: typeof removeAvailabilityOverrideById;
  getProfile?: typeof getProfileByUserId;
};

export const PROFILE_BUFFER_MINUTES_MIN = 0;
export const PROFILE_BUFFER_MINUTES_MAX = 60;

function parseTimeString(
  value: string,
): { hours: number; minutes: number } | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}:\d{2}$/.test(trimmed)) {
    return null;
  }
  const [hoursRaw, minutesRaw] = trimmed.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 24 || minutes < 0 || minutes >= 60) {
    return null;
  }
  if (hours === 24 && minutes !== 0) {
    return null;
  }
  if (minutes % 15 !== 0) {
    return null;
  }
  return { hours, minutes };
}

function timeToMinutes(value: { hours: number; minutes: number }): number {
  return value.hours * 60 + value.minutes;
}

function isValidDayOfWeek(value: number): value is AvailabilityDayOfWeek {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidBuffer(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= PROFILE_BUFFER_MINUTES_MIN &&
    value <= PROFILE_BUFFER_MINUTES_MAX
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (year < 1970 || year > 9999) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  return true;
}

function isProfileTimezoneSet(profileTimezone: string | null): boolean {
  return (
    typeof profileTimezone === "string" && profileTimezone.trim().length > 0
  );
}

function windowsOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  const aStart = parseTimeString(a.startTime);
  const aEnd = parseTimeString(a.endTime);
  const bStart = parseTimeString(b.startTime);
  const bEnd = parseTimeString(b.endTime);
  if (!aStart || !aEnd || !bStart || !bEnd) {
    return false;
  }
  const aStartMin = timeToMinutes(aStart);
  const aEndMin = timeToMinutes(aEnd);
  const bStartMin = timeToMinutes(bStart);
  const bEndMin = timeToMinutes(bEnd);
  return aStartMin < bEndMin && bStartMin < aEndMin;
}

function computePreviewRange(now: Date): { rangeStart: Date; rangeEnd: Date } {
  const rangeStart = new Date(now);
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 7);
  return { rangeStart, rangeEnd };
}

function formatLocalDate(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getLocalDayOfWeek(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const dayStr = formatter.format(date);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.indexOf(dayStr);
}

function formatLocalTime(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function buildPreviewLines(
  intervals: Interval[],
  now: Date,
  timeZone: string,
): WindowPreviewLine[] {
  const lines: WindowPreviewLine[] = [];
  const bucketByLocalDate = new Map<string, string[]>();
  for (const interval of intervals) {
    const start = formatLocalTime(interval.startUtc, timeZone);
    const end = formatLocalTime(interval.endUtc, timeZone);
    const key = formatLocalDate(interval.startUtc, timeZone);
    const list = bucketByLocalDate.get(key) ?? [];
    list.push(`${start}–${end}`);
    bucketByLocalDate.set(key, list);
  }
  const { rangeStart } = computePreviewRange(now);
  for (let i = 0; i < 7; i += 1) {
    const dayDate = new Date(rangeStart);
    dayDate.setUTCDate(dayDate.getUTCDate() + i);
    const dayOfWeek = getLocalDayOfWeek(dayDate, timeZone);
    const dayLabel = formatLocalDate(dayDate, timeZone);
    const dayIntervals = (bucketByLocalDate.get(dayLabel) ?? [])
      .slice()
      .sort((a, b) => a.localeCompare(b));
    lines.push({
      date: dayLabel,
      dayOfWeek,
      intervals: dayIntervals,
    });
  }
  return lines;
}

export function createAvailabilityWorkflow(
  deps: CreateAvailabilityWorkflowDeps = {},
): AvailabilityWorkflow {
  const listWindows = deps.listWindows ?? listWeeklyAvailabilityWindowsByUserId;
  const addWindowFn = deps.addWindow ?? addWeeklyAvailabilityWindow;
  const findWindow = deps.findWindow ?? findWeeklyAvailabilityWindowById;
  const removeWindowById =
    deps.removeWindowById ?? removeWeeklyAvailabilityWindowById;
  const listOverrides = deps.listOverrides ?? listAvailabilityOverridesByUserId;
  const addOverrideFn = deps.addOverride ?? addAvailabilityOverride;
  const removeOverrideById =
    deps.removeOverrideById ?? removeAvailabilityOverrideById;
  const getProfile = deps.getProfile ?? getProfileByUserId;

  async function loadProfile(userId: string): Promise<UserProfile | null> {
    return getProfile(userId);
  }

  return {
    async loadPageState({ userId, now }) {
      const profile = await loadProfile(userId);
      if (!profile) {
        return err({ code: "profile_timezone_required" });
      }
      if (!isProfileTimezoneSet(profile.profileTimezone)) {
        return err({ code: "profile_timezone_required" });
      }

      const profileTimezone = profile.profileTimezone as string;
      const [allWindows, allOverrides] = await Promise.all([
        listWindows(userId),
        listOverrides(userId),
      ]);

      const windowsByDay: Record<number, WeeklyAvailabilityWindow[]> = {
        0: [],
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      };
      for (const window of allWindows) {
        const list = windowsByDay[window.dayOfWeek] ?? [];
        list.push(window);
        windowsByDay[window.dayOfWeek] = list;
      }
      for (const day of Object.keys(windowsByDay)) {
        const dayIndex = Number(day);
        windowsByDay[dayIndex] = (windowsByDay[dayIndex] ?? [])
          .slice()
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
      }

      const overrides = allOverrides
        .slice()
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime),
        );

      const { rangeStart, rangeEnd } = computePreviewRange(now);
      const intervals = computeEffectiveAvailability({
        userId,
        profileTimezone,
        bufferMinutes: profile.bufferMinutes,
        windows: allWindows,
        overrides: allOverrides,
        busyIntervals: [],
        rangeStart,
        rangeEnd,
      });

      const previewLines = buildPreviewLines(intervals, now, profileTimezone);

      return ok({
        profileTimezone,
        bufferMinutes: profile.bufferMinutes,
        windowsByDay,
        overrides,
        previewLines,
      });
    },

    async addWindow({
      userId,
      dayOfWeek,
      startTime,
      endTime,
      profileTimezone,
    }) {
      const profile = await loadProfile(userId);
      if (!profile || !isProfileTimezoneSet(profile.profileTimezone)) {
        return err({
          code: "profile_timezone_required",
          field: "profileTimezone",
        });
      }
      if (!isProfileTimezoneSet(profileTimezone)) {
        return err({
          code: "profile_timezone_required",
          field: "profileTimezone",
        });
      }
      if (!isValidDayOfWeek(dayOfWeek)) {
        return err({ code: "invalid_time", field: "dayOfWeek" });
      }
      const start = parseTimeString(startTime);
      const end = parseTimeString(endTime);
      if (!start || !end) {
        return err({ code: "invalid_time", field: "startTime" });
      }
      if (start.hours === 24 || end.hours === 24) {
        return err({
          code: "outside_day",
          field: start.hours === 24 ? "startTime" : "endTime",
        });
      }
      if (timeToMinutes(start) >= timeToMinutes(end)) {
        return err({ code: "end_before_start", field: "endTime" });
      }

      const existing = await listWindows(userId);
      const overlap = existing.find(
        (window) =>
          window.dayOfWeek === dayOfWeek &&
          windowsOverlap(
            { startTime: window.startTime, endTime: window.endTime },
            { startTime, endTime },
          ),
      );
      if (overlap) {
        return err({ code: "overlap_existing_window", field: "startTime" });
      }

      const request: CreateWeeklyAvailabilityWindow = {
        dayOfWeek,
        startTime,
        endTime,
      };
      const window = await addWindowFn(userId, request, profileTimezone);
      return ok({ window });
    },

    async removeWindow({ userId, windowId }) {
      const found = await findWindow(windowId, userId);
      if (!found) {
        return err({ code: "not_found" });
      }
      const removed = await removeWindowById(windowId, userId);
      if (!removed) {
        return err({ code: "not_found" });
      }
      return ok({ windowId });
    },

    async addOverride({
      userId,
      date,
      startTime,
      endTime,
      type,
      profileTimezone,
    }) {
      const profile = await loadProfile(userId);
      if (!profile || !isProfileTimezoneSet(profile.profileTimezone)) {
        return err({
          code: "profile_timezone_required",
          field: "profileTimezone",
        });
      }
      if (!isProfileTimezoneSet(profileTimezone)) {
        return err({
          code: "profile_timezone_required",
          field: "profileTimezone",
        });
      }
      if (!date || !isValidDate(date)) {
        return err({ code: "date_required", field: "date" });
      }
      const start = parseTimeString(startTime);
      const end = parseTimeString(endTime);
      if (!start || !end) {
        return err({ code: "invalid_time", field: "startTime" });
      }
      if (timeToMinutes(start) >= timeToMinutes(end)) {
        return err({ code: "end_before_start", field: "endTime" });
      }
      const request: CreateAvailabilityOverride = {
        date,
        startTime,
        endTime,
        type,
      };
      const override = await addOverrideFn(userId, request, profileTimezone);
      return ok({ override });
    },

    async removeOverride({ userId, overrideId }) {
      const removed = await removeOverrideById(overrideId, userId);
      if (!removed) {
        return err({ code: "not_found" });
      }
      return ok({ overrideId });
    },

    validateBuffer({ bufferMinutes }) {
      if (!isValidBuffer(bufferMinutes)) {
        return err({ code: "invalid_buffer" });
      }
      return ok({ bufferMinutes });
    },
  };
}
