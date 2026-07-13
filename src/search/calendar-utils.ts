import type { SearchSnapshot, Slot } from "../db/schema";

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
  const lookbackLimit = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
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

export function alignToMonday(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  const weekday = get("weekday");
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));

  const offsetMs = Date.UTC(year, month - 1, day, 0, 0, 0) - date.getTime();
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs;

  const weekdayIndex =
    weekday === "Mon"
      ? 1
      : weekday === "Tue"
        ? 2
        : weekday === "Wed"
          ? 3
          : weekday === "Thu"
            ? 4
            : weekday === "Fri"
              ? 5
              : weekday === "Sat"
                ? 6
                : 0;
  const daysSinceMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1;

  return new Date(localMidnightAsUtc - daysSinceMonday * 86400000);
}
