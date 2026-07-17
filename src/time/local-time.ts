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

  constructor(name: string, message: string, local: LocalDateTime, timeZone: string) {
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
    return resolved.length > 0;
  } catch {
    return false;
  }
}