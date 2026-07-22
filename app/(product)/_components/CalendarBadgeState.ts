export type CalendarBadgeStatus =
  "none" | "connected" | "needs_reconnect" | "unsupported";

export type CalendarBadgeState = {
  status: CalendarBadgeStatus;
};

export const CALENDAR_BADGE_LABELS: Record<CalendarBadgeStatus, string> = {
  none: "Calendar: not connected",
  connected: "Calendar: connected",
  needs_reconnect: "Calendar: needs reconnect",
  unsupported: "Calendar: unsupported",
};

export const CALENDAR_BADGE_DATA_TESTID: Record<CalendarBadgeStatus, string> = {
  none: "calendar-badge-none",
  connected: "calendar-badge-connected",
  needs_reconnect: "calendar-badge-needs-reconnect",
  unsupported: "calendar-badge-unsupported",
};

export function buildCalendarBadgeState(
  rawStatus: string | null | undefined,
): CalendarBadgeState {
  if (!rawStatus) {
    return { status: "none" };
  }
  if (
    rawStatus === "needs_reconnect" ||
    rawStatus === "sync_delayed" ||
    rawStatus === "disconnected"
  ) {
    return { status: "needs_reconnect" };
  }
  if (rawStatus === "unsupported") {
    return { status: "unsupported" };
  }
  if (rawStatus === "connected") {
    return { status: "connected" };
  }
  return { status: "none" };
}

export function renderCalendarBadgeLabel(state: CalendarBadgeState): string {
  return CALENDAR_BADGE_LABELS[state.status];
}
