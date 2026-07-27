import type { SearchSnapshot, Slot } from "../db/schema";
import { addCivilDays, startOfWeekInTimezone } from "./timezone";

export function getSlotsForWeek(
  snapshot: SearchSnapshot,
  weekStart: Date,
): Slot[] {
  const weekEnd = addCivilDays(weekStart, 7, snapshot.organizerTimezone);

  return snapshot.slots.filter((slot) => {
    const slotDate = new Date(slot.startUtc);
    return slotDate >= weekStart && slotDate < weekEnd;
  });
}

export function slotHasStaleMatch(slot: Slot): boolean {
  return slot.matches.some((m) => m.calendarFreshness === "stale");
}

export function getPreviousWeekStart(
  currentWeekStart: Date,
  today: Date,
): Date | null {
  const lookbackLimit = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  if (previousWeekStart < lookbackLimit) {
    return null;
  }
  return previousWeekStart;
}

export function getNextWeekStart(
  currentWeekStart: Date,
  snapshotDateRangeEnd: Date,
): Date | null {
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
  if (nextWeekStart >= snapshotDateRangeEnd) {
    return null;
  }
  return nextWeekStart;
}

export function alignToMonday(date: Date, timezone: string): Date {
  return startOfWeekInTimezone(date, timezone);
}
