export type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

export function isValidIanaTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function partsToRecord(
  parts: Intl.DateTimeFormatPart[],
): CalendarDateParts & { hour: number; minute: number; second: number } {
  const get = (type: Intl.DateTimeFormatPart["type"]) =>
    Number(parts.find((part) => part.type === type)?.value ?? "NaN");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function calendarDateParts(
  date: Date,
  timezone: string,
): CalendarDateParts {
  return partsToRecord(formatterFor(timezone).formatToParts(date));
}

export function calendarDayNumber(date: Date, timezone: string): number {
  const parts = calendarDateParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000;
}

export function zonedTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  timezone: string,
): Date {
  const target = Date.UTC(year, monthIndex, day, 0, 0, 0);
  let candidate = new Date(target);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partsToRecord(
      formatterFor(timezone).formatToParts(candidate),
    );
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const offsetMs = localAsUtc - candidate.getTime();
    const next = new Date(target - offsetMs);
    if (next.getTime() === candidate.getTime()) break;
    candidate = next;
  }

  const roundTrip = partsToRecord(
    formatterFor(timezone).formatToParts(candidate),
  );
  if (
    roundTrip.year !== year ||
    roundTrip.month !== monthIndex + 1 ||
    roundTrip.day !== day ||
    roundTrip.hour !== 0 ||
    roundTrip.minute !== 0 ||
    roundTrip.second !== 0
  ) {
    return new Date(NaN);
  }
  return candidate;
}

export function addCivilDays(date: Date, days: number, timezone: string): Date {
  const parts = calendarDateParts(date, timezone);
  const target = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return zonedTimeToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
    timezone,
  );
}

export function startOfWeekInTimezone(date: Date, timezone: string): Date {
  const local = calendarDateParts(date, timezone);
  const weekday = new Date(
    Date.UTC(local.year, local.month - 1, local.day),
  ).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return addCivilDays(date, -daysSinceMonday, timezone);
}
