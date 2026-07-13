export type CalendarConnectionHealthStatus =
  | "connected"
  | "sync_delayed"
  | "needs_reconnect"
  | "disconnected"
  | "unsupported";

export const SYNC_DELAYED_THRESHOLD_HOURS = 1;
export const STALE_THRESHOLD_HOURS = 24;

export type CalendarConnectionHealthInput = {
  id: string;
  status:
    | "pending"
    | "connected"
    | "disconnected"
    | "sync_delayed"
    | "needs_reconnect"
    | "unsupported";
  provider: "google" | "microsoft";
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt?: Date | null;
};

export function computeCalendarConnectionHealthStatus(
  connection: CalendarConnectionHealthInput,
  now: Date,
): CalendarConnectionHealthStatus {
  if (connection.status === "unsupported") {
    return "unsupported";
  }

  if (connection.status === "disconnected") {
    return "disconnected";
  }

  if (
    connection.lastErrorCode === "invalid_grant" ||
    connection.lastErrorCode === "token_revoked"
  ) {
    return "needs_reconnect";
  }

  if (connection.lastSyncAt === null || connection.lastSyncAt === undefined) {
    return "connected";
  }

  const hoursSinceSync =
    (now.getTime() - connection.lastSyncAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceSync > SYNC_DELAYED_THRESHOLD_HOURS) {
    return "sync_delayed";
  }

  return "connected";
}

export function isCalendarConnectionStale(
  connection: CalendarConnectionHealthInput,
  now: Date,
  staleThresholdHours: number = STALE_THRESHOLD_HOURS,
): boolean {
  if (connection.status === "disconnected" || connection.status === "unsupported") {
    return false;
  }

  if (connection.lastSyncAt === null || connection.lastSyncAt === undefined) {
    return true;
  }

  const hoursSinceSync =
    (now.getTime() - connection.lastSyncAt.getTime()) / (1000 * 60 * 60);

  return hoursSinceSync > staleThresholdHours;
}

export type CalendarConnectionHealthFields = {
  lastSyncAt: Date | null;
  stale: boolean;
  healthStatus: CalendarConnectionHealthStatus;
};

export function buildCalendarConnectionHealthFields(
  connection: CalendarConnectionHealthInput,
  now: Date,
): CalendarConnectionHealthFields {
  return {
    lastSyncAt: connection.lastSyncAt ?? null,
    stale: isCalendarConnectionStale(connection, now),
    healthStatus: computeCalendarConnectionHealthStatus(connection, now),
  };
}
