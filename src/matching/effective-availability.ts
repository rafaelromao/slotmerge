import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import { expandOverrideToUtcRange } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";

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

function isInRange(interval: Interval, rangeStart: Date, rangeEnd: Date): boolean {
  return interval.startUtc < rangeEnd && interval.endUtc > rangeStart;
}

function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function toUtcDateForTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timeZone: string,
): Date {
  const noonUtc = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const noonInTz = Number(
    tzFormatter.formatToParts(noonUtc).find((p) => p.type === "hour")!.value,
  );
  const utcHours = hours + 12 - noonInTz;
  return new Date(Date.UTC(year, month, day, utcHours, minutes));
}

function getLocalDayOfWeekAtNoon(
  utcYear: number,
  utcMonth: number,
  utcDay: number,
  timeZone: string,
): number {
  const noonUtc = new Date(Date.UTC(utcYear, utcMonth, utcDay, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const dayStr = formatter.format(noonUtc);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.indexOf(dayStr);
}

function expandWindowsInTimezone(
  windows: WeeklyAvailabilityWindow[],
  rangeStart: Date,
  rangeEnd: Date,
): Interval[] {
  const results: Interval[] = [];

  for (const window of windows) {
    const current = new Date(rangeStart);
    current.setUTCHours(0, 0, 0, 0);

    const end = new Date(rangeEnd);
    end.setUTCHours(23, 59, 59, 999);

    while (current <= end) {
      const utcYear = current.getUTCFullYear();
      const utcMonth = current.getUTCMonth();
      const utcDay = current.getUTCDate();

      const localDayOfWeek = getLocalDayOfWeekAtNoon(
        utcYear,
        utcMonth,
        utcDay,
        window.profileTimezone,
      );

      if (localDayOfWeek === window.dayOfWeek) {
        const { hours: startHours, minutes: startMinutes } = parseTime(window.startTime);
        const { hours: endHours, minutes: endMinutes } = parseTime(window.endTime);

        const startUtc = toUtcDateForTimezone(
          utcYear,
          utcMonth,
          utcDay,
          startHours,
          startMinutes,
          window.profileTimezone,
        );

        const endUtc = toUtcDateForTimezone(
          utcYear,
          utcMonth,
          utcDay,
          endHours,
          endMinutes,
          window.profileTimezone,
        );

        const interval = { startUtc, endUtc };
        if (isInRange(interval, rangeStart, rangeEnd)) {
          results.push(interval);
        }
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  return results;
}

export function computeEffectiveAvailability(
  inputs: EffectiveAvailabilityInputs,
): Interval[] {
  const { bufferMinutes, windows, overrides, busyIntervals, rangeStart, rangeEnd } = inputs;

  if (rangeStart >= rangeEnd) {
    return [];
  }

  let available: Interval[] = expandWindowsInTimezone(windows, rangeStart, rangeEnd);

  for (const override of overrides) {
    if (override.type !== "add") {
      continue;
    }
    const range = expandOverrideToUtcRange(
      { date: override.date, startTime: override.startTime, endTime: override.endTime, type: override.type },
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
      { date: override.date, startTime: override.startTime, endTime: override.endTime, type: override.type },
      override.profileTimezone,
    );
    if (isInRange(range, rangeStart, rangeEnd)) {
      const blockRange = clipInterval(range, rangeStart, rangeEnd);
      if (blockRange) {
        available = subtractInterval(available, blockRange);
      }
    }
  }

  for (const busy of busyIntervals) {
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

function subtractInterval(available: Interval[], toRemove: Interval): Interval[] {
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
  if (toRemove.endUtc <= interval.startUtc || toRemove.startUtc >= interval.endUtc) {
    return [interval];
  }
  if (toRemove.startUtc <= interval.startUtc && toRemove.endUtc >= interval.endUtc) {
    return [];
  }
  if (toRemove.startUtc <= interval.startUtc && toRemove.endUtc < interval.endUtc) {
    return [{ startUtc: toRemove.endUtc, endUtc: interval.endUtc }];
  }
  if (toRemove.startUtc > interval.startUtc && toRemove.endUtc >= interval.endUtc) {
    return [{ startUtc: interval.startUtc, endUtc: toRemove.startUtc }];
  }
  if (toRemove.startUtc > interval.startUtc && toRemove.endUtc < interval.endUtc) {
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
  const sorted = [...intervals].sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
  const result: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];
    if (current.startUtc.getTime() <= last.endUtc.getTime()) {
      const mergedEnd = current.endUtc.getTime() > last.endUtc.getTime() ? current.endUtc : last.endUtc;
      result[result.length - 1] = { startUtc: last.startUtc, endUtc: mergedEnd };
    } else {
      result.push(current);
    }
  }
  return result;
}
