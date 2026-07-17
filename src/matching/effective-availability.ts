import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import { expandOverrideToUtcRange } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";
import { getLocalDateParts, localDateTimeToUtc } from "../time/local-time";

export type EffectiveAvailabilityInputs = {
  userId: string;
  profileTimezone: string;
  bufferMinutes: number;
  windows: WeeklyAvailabilityWindow[];
  overrides: AvailabilityOverride[];
  busyIntervals: ImportedBusyIntervalRecord[];
  rangeStart: Date;
  rangeEnd: Date;
};

type Interval = { startUtc: Date; endUtc: Date };

export type { Interval };

function isInRange(
  interval: Interval,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return interval.startUtc < rangeEnd && interval.endUtc > rangeStart;
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function expandWindowsInTimezone(
  windows: WeeklyAvailabilityWindow[],
  rangeStart: Date,
  rangeEnd: Date,
): Interval[] {
  const results: Interval[] = [];

  for (const window of windows) {
    let cursorUtc = new Date(rangeStart.getTime());
    while (cursorUtc.getTime() <= rangeEnd.getTime()) {
      const localParts = getLocalDateParts(cursorUtc, window.profileTimezone);
      const utcOnLocalDay = localDateTimeToUtc(
        {
          year: localParts.year,
          month: localParts.month,
          day: localParts.day,
          hour: 0,
          minute: 0,
          second: 0,
        },
        window.profileTimezone,
      );
      const localDateAtCursor = getLocalDateParts(
        utcOnLocalDay,
        window.profileTimezone,
      );

      if (localDateAtCursor.weekday === window.dayOfWeek) {
        const { hours: startHours, minutes: startMinutes } = parseTime(
          window.startTime,
        );
        const { hours: endHours, minutes: endMinutes } = parseTime(
          window.endTime,
        );

        const startUtc = localDateTimeToUtc(
          {
            year: localDateAtCursor.year,
            month: localDateAtCursor.month,
            day: localDateAtCursor.day,
            hour: startHours,
            minute: startMinutes,
          },
          window.profileTimezone,
        );

        const endUtc = localDateTimeToUtc(
          {
            year: localDateAtCursor.year,
            month: localDateAtCursor.month,
            day: localDateAtCursor.day,
            hour: endHours,
            minute: endMinutes,
          },
          window.profileTimezone,
        );

        const interval = { startUtc, endUtc };
        const clipped = clipInterval(interval, rangeStart, rangeEnd);
        if (clipped) {
          results.push(clipped);
        }
      }

      cursorUtc = new Date(utcOnLocalDay.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return results;
}

export function computeEffectiveAvailability(
  inputs: EffectiveAvailabilityInputs,
): Interval[] {
  const {
    bufferMinutes,
    windows,
    overrides,
    busyIntervals,
    rangeStart,
    rangeEnd,
  } = inputs;

  if (rangeStart >= rangeEnd) {
    return [];
  }

  let available: Interval[] = expandWindowsInTimezone(
    windows,
    rangeStart,
    rangeEnd,
  );

  for (const override of overrides) {
    if (override.type !== "add") {
      continue;
    }
    const range = expandOverrideToUtcRange(
      {
        date: override.date,
        startTime: override.startTime,
        endTime: override.endTime,
        type: override.type,
      },
      override.profileTimezone,
    );
    if (isInRange(range, rangeStart, rangeEnd)) {
      const clipped = clipInterval(range, rangeStart, rangeEnd);
      if (clipped) {
        available.push(clipped);
      }
    }
  }

  for (const override of overrides) {
    if (override.type !== "block") {
      continue;
    }
    const range = expandOverrideToUtcRange(
      {
        date: override.date,
        startTime: override.startTime,
        endTime: override.endTime,
        type: override.type,
      },
      override.profileTimezone,
    );
    if (isInRange(range, rangeStart, rangeEnd)) {
      const blockRange = clipInterval(range, rangeStart, rangeEnd);
      if (blockRange) {
        available = subtractInterval(available, blockRange);
      }
    }
  }

  const blockingStatuses: Set<string> = new Set([
    "busy",
    "out-of-office",
    "tentative",
  ]);

  for (const busy of busyIntervals) {
    if (!blockingStatuses.has(busy.status)) {
      continue;
    }
    const bufferMs = bufferMinutes * 60 * 1000;
    const busyStart = new Date(busy.startAt.getTime() - bufferMs);
    const busyEnd = new Date(busy.endAt.getTime() + bufferMs);
    const busyRange = { startUtc: busyStart, endUtc: busyEnd };
    if (isInRange(busyRange, rangeStart, rangeEnd)) {
      const clippedBusy = clipInterval(busyRange, rangeStart, rangeEnd);
      if (clippedBusy) {
        available = subtractInterval(available, clippedBusy);
      }
    }
  }

  available = mergeOverlapping(available);

  return available;
}

function clipInterval(
  interval: Interval,
  rangeStart: Date,
  rangeEnd: Date,
): Interval | null {
  const start = interval.startUtc < rangeStart ? rangeStart : interval.startUtc;
  const end = interval.endUtc > rangeEnd ? rangeEnd : interval.endUtc;
  if (start >= end) {
    return null;
  }
  return { startUtc: start, endUtc: end };
}

function subtractInterval(
  available: Interval[],
  toRemove: Interval,
): Interval[] {
  const result: Interval[] = [];
  for (const interval of available) {
    const remaining = subtractPortion(interval, toRemove);
    for (const r of remaining) {
      result.push(r);
    }
  }
  return result;
}

function subtractPortion(interval: Interval, toRemove: Interval): Interval[] {
  if (
    toRemove.endUtc <= interval.startUtc ||
    toRemove.startUtc >= interval.endUtc
  ) {
    return [interval];
  }
  if (
    toRemove.startUtc <= interval.startUtc &&
    toRemove.endUtc >= interval.endUtc
  ) {
    return [];
  }
  if (
    toRemove.startUtc <= interval.startUtc &&
    toRemove.endUtc < interval.endUtc
  ) {
    return [{ startUtc: toRemove.endUtc, endUtc: interval.endUtc }];
  }
  if (
    toRemove.startUtc > interval.startUtc &&
    toRemove.endUtc >= interval.endUtc
  ) {
    return [{ startUtc: interval.startUtc, endUtc: toRemove.startUtc }];
  }
  if (
    toRemove.startUtc > interval.startUtc &&
    toRemove.endUtc < interval.endUtc
  ) {
    return [
      { startUtc: interval.startUtc, endUtc: toRemove.startUtc },
      { startUtc: toRemove.endUtc, endUtc: interval.endUtc },
    ];
  }
  return [interval];
}

function mergeOverlapping(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) {
    return [];
  }
  const sorted = [...intervals].sort(
    (a, b) => a.startUtc.getTime() - b.startUtc.getTime(),
  );
  const result: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];
    if (current.startUtc.getTime() <= last.endUtc.getTime()) {
      const mergedEnd =
        current.endUtc.getTime() > last.endUtc.getTime()
          ? current.endUtc
          : last.endUtc;
      result[result.length - 1] = {
        startUtc: last.startUtc,
        endUtc: mergedEnd,
      };
    } else {
      result.push(current);
    }
  }
  return result;
}
