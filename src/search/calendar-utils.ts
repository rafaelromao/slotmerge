import type { SearchSnapshot, Slot } from "../db/schema";
import { startOfWeekInTimezone } from "./search-input";

export function getSlotsForWeek(
  snapshot: SearchSnapshot,
  weekStart: Date,
): Slot[] {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

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
  const lookbackLimit = new Date(
    today.getTime() - 90 * 24 * 60 * 60 * 1000,
  );
  const previousWeekStart = new Date(
    currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  if (previousWeekStart < lookbackLimit) {
    return null;
  }
  return previousWeekStart;
}

export function getNextWeekStart(
  currentWeekStart: Date,
  snapshotDateRangeEnd: Date,
): Date | null {
  const nextWeekStart = new Date(
    currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000,
  );
  if (nextWeekStart >= snapshotDateRangeEnd) {
    return null;
  }
  return nextWeekStart;
}

export { startOfWeekInTimezone as alignToMonday };