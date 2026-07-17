import type { BusyIntervalStatus } from "../../db/schema";
import type { CalendarProvider as CalendarProviderId } from "../../db/schema";

export const RATE_LIMIT_BASE_MS = 30_000;
export const SERVER_ERROR_BASE_MS = 60_000;

export type FreeBusyInterval = {
  providerCalendarId: string;
  eventId?: string;
  status: BusyIntervalStatus;
  startAt: Date;
  endAt: Date;
};

export class FreeBusyAuthError extends Error {
  readonly provider: CalendarProviderId;
  constructor(provider: CalendarProviderId) {
    super(`${capitalize(provider)} authentication failed`);
    this.name = "FreeBusyAuthError";
    this.provider = provider;
  }
}

export class FreeBusyRateLimitError extends Error {
  readonly provider: CalendarProviderId;
  readonly retryAfterSeconds: number | undefined;
  constructor(
    provider: CalendarProviderId,
    retryAfterSeconds: number | undefined,
  ) {
    super(`${capitalize(provider)} FreeBusy rate limit exceeded`);
    this.name = "FreeBusyRateLimitError";
    this.provider = provider;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class FreeBusyServerError extends Error {
  readonly provider: CalendarProviderId;
  readonly retryAfterSeconds: number | undefined;
  readonly statusCode: number;
  constructor(
    provider: CalendarProviderId,
    statusCode: number,
    retryAfterSeconds: number | undefined,
  ) {
    super(`${capitalize(provider)} FreeBusy server error: ${statusCode}`);
    this.name = "FreeBusyServerError";
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}
