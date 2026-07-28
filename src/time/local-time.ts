export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
};

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

export type LocalDayHour = {
  dayOfWeek: number;
  hour: number;
};

export class NonexistentLocalTimeError extends Error {
  public override readonly name = "NonexistentLocalTimeError";
  public readonly local: LocalDateTime;
  public readonly timezone: string;
  public readonly utcBefore: Date;
  public readonly utcAfter: Date;

  constructor(
    local: LocalDateTime,
    timezone: string,
    utcBefore: Date,
    utcAfter: Date,
  ) {
    super(
      `Local time ${formatLocal(local)} does not exist in ${timezone} (spring-forward gap between ${utcBefore.toISOString()} and ${utcAfter.toISOString()}).`,
    );
    this.local = local;
    this.timezone = timezone;
    this.utcBefore = utcBefore;
    this.utcAfter = utcAfter;
  }
}

export class AmbiguousLocalTimeError extends Error {
  public override readonly name = "AmbiguousLocalTimeError";
  public readonly local: LocalDateTime;
  public readonly timezone: string;
  public readonly utcEarlier: Date;
  public readonly utcLater: Date;

  constructor(
    local: LocalDateTime,
    timezone: string,
    utcEarlier: Date,
    utcLater: Date,
  ) {
    super(
      `Local time ${formatLocal(local)} is ambiguous in ${timezone}; candidates ${utcEarlier.toISOString()} and ${utcLater.toISOString()}.`,
    );
    this.local = local;
    this.timezone = timezone;
    this.utcEarlier = utcEarlier;
    this.utcLater = utcLater;
  }
}

function formatLocal(local: LocalDateTime): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${local.year}-${pad(local.month)}-${pad(local.day)} ` +
    `${pad(local.hour)}:${pad(local.minute)}` +
    (local.second !== undefined ? `:${pad(local.second)}` : "")
  );
}

/**
 * Validates that `timezone` is an IANA zone that Node's `Intl` runtime can
 * resolve. Accepts canonical names and aliases (e.g. both `Asia/Katmandu` and
 * the older `Asia/Kathmandu` spelling). Throws `RangeError` for empty input,
 * unknown names, and names whose resolver returns no canonical form.
 */
export function isValidTimeZone(timezone: string): void {
  if (typeof timezone !== "string" || timezone.length === 0) {
    throw new RangeError(`Invalid IANA timezone: ${JSON.stringify(timezone)}`);
  }
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    }).resolvedOptions().timeZone;
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${JSON.stringify(timezone)}`);
  }
  if (typeof resolved !== "string" || resolved.length === 0) {
    throw new RangeError(`Invalid IANA timezone: ${JSON.stringify(timezone)}`);
  }
}

const DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = DATE_FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
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
    DATE_FORMATTER_CACHE.set(timezone, formatter);
  }
  return formatter;
}

const WEEKDAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function weekdayFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = WEEKDAY_FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    WEEKDAY_FORMATTER_CACHE.set(timezone, formatter);
  }
  return formatter;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function readWeekday(date: Date, timezone: string): number {
  const dayStr = weekdayFormatter(timezone).format(date);
  return WEEKDAY_MAP[dayStr] ?? 0;
}

function readParts(
  date: Date,
  timezone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = dateFormatter(timezone).formatToParts(date);
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

export function getLocalDateParts(
  date: Date,
  timezone: string,
): LocalDateParts {
  isValidTimeZone(timezone);
  const parts = readParts(date, timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function localDayNumber(date: Date, timezone: string): number {
  const parts = getLocalDateParts(date, timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000;
}

export function addCivilDays(date: Date, days: number, timezone: string): Date {
  const parts = getLocalDateParts(date, timezone);
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  target.setUTCDate(target.getUTCDate() + days);
  return localDateTimeToUtc(
    {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: target.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );
}

export function getLocalDayHour(date: Date, timezone: string): LocalDayHour {
  isValidTimeZone(timezone);
  const parts = readParts(date, timezone);
  return { dayOfWeek: readWeekday(date, timezone), hour: parts.hour };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

function validateCivilFields(local: LocalDateTime): void {
  if (!Number.isInteger(local.year)) {
    throw new RangeError(`Invalid year: ${local.year}`);
  }
  if (!Number.isInteger(local.month) || local.month < 1 || local.month > 12) {
    throw new RangeError(`Invalid month: ${local.month}`);
  }
  const maxDay = daysInMonth(local.year, local.month);
  if (!Number.isInteger(local.day) || local.day < 1 || local.day > maxDay) {
    throw new RangeError(`Invalid day: ${local.day}`);
  }
  if (!Number.isInteger(local.hour) || local.hour < 0 || local.hour > 23) {
    throw new RangeError(`Invalid hour: ${local.hour}`);
  }
  if (
    !Number.isInteger(local.minute) ||
    local.minute < 0 ||
    local.minute > 59
  ) {
    throw new RangeError(`Invalid minute: ${local.minute}`);
  }
  if (local.second !== undefined) {
    if (
      !Number.isInteger(local.second) ||
      local.second < 0 ||
      local.second > 59
    ) {
      throw new RangeError(`Invalid second: ${local.second}`);
    }
  }
}

function baseUtcFor(local: LocalDateTime): number {
  return Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second ?? 0,
  );
}

function probeOffsetMs(probeUtcMs: number, timezone: string): number {
  const parts = readParts(new Date(probeUtcMs), timezone);
  const partsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return partsUtc - probeUtcMs;
}

function candidateForOffset(baseUtcMs: number, offsetMs: number): number {
  return baseUtcMs - offsetMs;
}

function candidateRoundTrips(
  candidateUtcMs: number,
  local: LocalDateTime,
  timezone: string,
): boolean {
  const parts = readParts(new Date(candidateUtcMs), timezone);
  return (
    parts.year === local.year &&
    parts.month === local.month &&
    parts.day === local.day &&
    parts.hour === local.hour &&
    parts.minute === local.minute &&
    parts.second === (local.second ?? 0)
  );
}

export function localDateTimeToUtc(
  local: LocalDateTime,
  timezone: string,
): Date {
  isValidTimeZone(timezone);
  validateCivilFields(local);

  const baseUtcMs = baseUtcFor(local);

  const PROBE_DAY_MS = 24 * 60 * 60 * 1000;
  const probes: number[] = [
    baseUtcMs,
    baseUtcMs - PROBE_DAY_MS,
    baseUtcMs + PROBE_DAY_MS,
  ];

  const offsets = new Set<number>();
  for (const probe of probes) {
    offsets.add(probeOffsetMs(probe, timezone));
  }

  const candidates: Date[] = [];
  for (const offsetMs of offsets) {
    const candidateMs = candidateForOffset(baseUtcMs, offsetMs);
    if (candidateRoundTrips(candidateMs, local, timezone)) {
      candidates.push(new Date(candidateMs));
    }
  }

  if (candidates.length === 0) {
    const sortedOffsets = Array.from(offsets).sort((a, b) => a - b);
    const smallestOffset = sortedOffsets[0] ?? 0;
    const largestOffset = sortedOffsets[sortedOffsets.length - 1] ?? 0;
    const utcBefore = new Date(candidateForOffset(baseUtcMs, smallestOffset));
    const utcAfter = new Date(candidateForOffset(baseUtcMs, largestOffset));
    throw new NonexistentLocalTimeError(local, timezone, utcBefore, utcAfter);
  }

  if (candidates.length === 2) {
    candidates.sort((a, b) => a.getTime() - b.getTime());
    const earlier = candidates[0];
    const later = candidates[1];
    if (!earlier || !later) {
      throw new RangeError(
        `Failed to resolve ambiguous candidates for ${JSON.stringify(timezone)}`,
      );
    }
    throw new AmbiguousLocalTimeError(local, timezone, earlier, later);
  }

  const unique = candidates[0];
  if (!unique) {
    throw new RangeError(
      `Failed to resolve unique candidate for ${JSON.stringify(timezone)}`,
    );
  }
  return unique;
}

export function startOfWeekInTimezone(date: Date, timezone: string): Date {
  isValidTimeZone(timezone);
  const parts = getLocalDateParts(date, timezone);
  const weekday = readWeekday(date, timezone);
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

  const mondayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  mondayUtc.setUTCDate(mondayUtc.getUTCDate() - daysSinceMonday);

  return localDateTimeToUtc(
    {
      year: mondayUtc.getUTCFullYear(),
      month: mondayUtc.getUTCMonth() + 1,
      day: mondayUtc.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timezone,
  );
}
