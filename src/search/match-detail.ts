import type { Interval } from "../matching/find-eligible-matches";
import type { AvailabilityIndicator, CalendarFreshness } from "../db/schema";

export const CALENDAR_STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export function deriveCalendarFreshness(
  lastSyncAt: Date | null,
  now: Date,
): CalendarFreshness {
  if (lastSyncAt === null) {
    return "none";
  }
  const elapsed = now.getTime() - lastSyncAt.getTime();
  if (elapsed < CALENDAR_STALENESS_THRESHOLD_MS) {
    return "fresh";
  }
  return "stale";
}

export function availabilityIndicator(
  slotStart: Date,
  effectiveAvailability: Interval[],
  durationMinutes: number,
): AvailabilityIndicator {
  const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
  const slotEndMs = slotEnd.getTime();
  const slotStartMs = slotStart.getTime();

  if (effectiveAvailability.length === 0) {
    return "unavailable";
  }

  let hasPartial = false;
  let current = slotStartMs;

  for (const interval of effectiveAvailability) {
    const intervalStartMs = interval.startUtc.getTime();
    const intervalEndMs = interval.endUtc.getTime();

    if (intervalEndMs <= current) {
      continue;
    }

    if (intervalStartMs > current) {
      hasPartial = true;
      break;
    }

    if (intervalEndMs >= slotEndMs) {
      return "available";
    }

    current = intervalEndMs;
    if (current >= slotEndMs) {
      return "available";
    }
    hasPartial = true;
  }

  if (hasPartial) {
    return "partial";
  }

  return "unavailable";
}
