const IANA_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
};

export class LocalTimeError extends Error {
  readonly local: LocalDateTime;
  readonly timeZone: string;

  constructor(
    name: string,
    message: string,
    local: LocalDateTime,
    timeZone: string,
  ) {
    super(message);
    this.name = name;
    this.local = local;
    this.timeZone = timeZone;
  }
}

export class NonexistentLocalTimeError extends LocalTimeError {
  constructor(local: LocalDateTime, timeZone: string) {
    super(
      "NonexistentLocalTimeError",
      `Local time ${formatLocalForError(local)} does not exist in ${timeZone} (DST spring-forward gap).`,
      local,
      timeZone,
    );
  }
}

export class AmbiguousLocalTimeError extends LocalTimeError {
  constructor(local: LocalDateTime, timeZone: string) {
    super(
      "AmbiguousLocalTimeError",
      `Local time ${formatLocalForError(local)} is ambiguous in ${timeZone} (DST fall-back overlap).`,
      local,
      timeZone,
    );
  }
}

function formatLocalForError(local: LocalDateTime): string {
  const hh = String(local.hour ?? 0).padStart(2, "0");
  const mm = String(local.minute ?? 0).padStart(2, "0");
  const ss = String(local.second ?? 0).padStart(2, "0");
  const month = String(local.month).padStart(2, "0");
  const day = String(local.day).padStart(2, "0");
  return `${local.year}-${month}-${day}T${hh}:${mm}:${ss}`;
}

export function isValidTimeZone(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
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

export function localDateTimeToUtc(
  local: LocalDateTime,
  timeZone: string,
): Date {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(
      `Invalid IANA timeZone: ${timeZone}. No UTC fallback.`,
    );
  }
  validateLocalDateTime(local);

  const target: Required<LocalDateTime> = {
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour ?? 0,
    minute: local.minute ?? 0,
    second: local.second ?? 0,
  };

  const utcGuess = naiveUtc(target);
  const partsAtGuess = getLocalPartsFromUtc(utcGuess, timeZone);
  const naiveUtcForParts = naiveUtc({
    year: partsAtGuess.year,
    month: partsAtGuess.month,
    day: partsAtGuess.day,
    hour: partsAtGuess.hour,
    minute: partsAtGuess.minute,
    second: partsAtGuess.second,
  });
  const offsetMs = utcGuess.getTime() - naiveUtcForParts.getTime();
  const correctedUtc = new Date(utcGuess.getTime() + offsetMs);
  const verifiedParts = getLocalPartsFromUtc(correctedUtc, timeZone);

  if (sameLocalParts(verifiedParts, target)) {
    if (isAmbiguousAt(correctedUtc, timeZone)) {
      throw new AmbiguousLocalTimeError(local, timeZone);
    }
    return new Date(correctedUtc.getTime());
  }

  if (isNonexistentTarget(target, timeZone)) {
    throw new NonexistentLocalTimeError(local, timeZone);
  }
  throw new NonexistentLocalTimeError(local, timeZone);
}

function validateLocalDateTime(local: LocalDateTime): void {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = local;
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError(`LocalDateTime year must be a positive integer.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`LocalDateTime month must be between 1 and 12.`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError(`LocalDateTime day must be between 1 and 31.`);
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`LocalDateTime hour must be between 0 and 23.`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new RangeError(`LocalDateTime minute must be between 0 and 59.`);
  }
  if (!Number.isInteger(second) || second < 0 || second > 59) {
    throw new RangeError(`LocalDateTime second must be between 0 and 59.`);
  }
}

function naiveUtc(local: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): Date {
  return new Date(
    Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    ),
  );
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getLocalPartsFromUtc(utc: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utc);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function sameLocalParts(a: LocalParts, b: LocalDateTime): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === (b.hour ?? 0) &&
    a.minute === (b.minute ?? 0) &&
    a.second === (b.second ?? 0)
  );
}

function isNonexistentTarget(
  target: Required<LocalDateTime>,
  timeZone: string,
): boolean {
  const beforeUtc = new Date(naiveUtc(target).getTime() - 60 * 60 * 1000);
  const afterUtc = new Date(naiveUtc(target).getTime() + 60 * 60 * 1000);
  const before = getLocalPartsFromUtc(beforeUtc, timeZone);
  const after = getLocalPartsFromUtc(afterUtc, timeZone);
  if (before.day === after.day) {
    return after.hour - before.hour >= 2;
  }
  if (after.day - before.day === 1) {
    const hoursCrossed = 24 + after.hour - before.hour;
    return hoursCrossed >= 23;
  }
  return false;
}

function isAmbiguousAt(utc: Date, timeZone: string): boolean {
  const hourLater = new Date(utc.getTime() + 60 * 60 * 1000);
  const before = getLocalPartsFromUtc(utc, timeZone);
  const after = getLocalPartsFromUtc(hourLater, timeZone);
  return sameLocalParts(before, after);
}

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export type LocalDayHour = {
  dayIndex: number;
  hour: number;
};

const WEEKDAY_ORDER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getLocalDateParts(
  date: Date,
  timeZone: string,
): LocalDateParts {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(
      `Invalid IANA timeZone: ${timeZone}. No UTC fallback.`,
    );
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const weekday = WEEKDAY_ORDER[weekdayStr] ?? 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
    weekday,
  };
}

export function startOfWeekInTimezone(date: Date, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(
      `Invalid IANA timeZone: ${timeZone}. No UTC fallback.`,
    );
  }
  const parts = getLocalDateParts(date, timeZone);
  const mondayIndex = parts.weekday === 0 ? 6 : parts.weekday - 1;
  const targetDay = parts.day - mondayIndex;
  if (targetDay < 1) {
    const mondayUtc = localDateTimeToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
    const adjusted = new Date(
      mondayUtc.getTime() - mondayIndex * 24 * 60 * 60 * 1000,
    );
    return adjusted;
  }
  return localDateTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: targetDay,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

export function getLocalDayHour(date: Date, timeZone: string): LocalDayHour {
  const parts = getLocalDateParts(date, timeZone);
  const dayIndex = parts.weekday === 0 ? 6 : parts.weekday - 1;
  return { dayIndex, hour: parts.hour };
}
