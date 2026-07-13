import type { BusyIntervalStatus } from "../../db/schema";

export const RATE_LIMIT_BASE_MS = 30_000;
export const SERVER_ERROR_BASE_MS = 60_000;

export type FreeBusyInterval = {
  providerCalendarId: string;
  eventId?: string;
  status: BusyIntervalStatus;
  startAt: Date;
  endAt: Date;
};

export class GoogleFreeBusyAuthError extends Error {
  readonly retryAfterSeconds: number | undefined;
  constructor() {
    super("Google authentication failed");
    this.name = "GoogleFreeBusyAuthError";
  }
}

export class GoogleFreeBusyRateLimitError extends Error {
  readonly retryAfterSeconds: number | undefined;
  constructor(retryAfterSeconds: number | undefined) {
    super("Google FreeBusy rate limit exceeded");
    this.name = "GoogleFreeBusyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class GoogleFreeBusyServerError extends Error {
  readonly retryAfterSeconds: number | undefined;
  readonly statusCode: number;
  constructor(statusCode: number, retryAfterSeconds: number | undefined) {
    super(`Google FreeBusy server error: ${statusCode}`);
    this.name = "GoogleFreeBusyServerError";
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MicrosoftFreeBusyAuthError extends Error {
  readonly retryAfterSeconds: number | undefined;
  constructor() {
    super("Microsoft authentication failed");
    this.name = "MicrosoftFreeBusyAuthError";
  }
}

export class MicrosoftFreeBusyRateLimitError extends Error {
  readonly retryAfterSeconds: number | undefined;
  constructor(retryAfterSeconds: number | undefined) {
    super("Microsoft FreeBusy rate limit exceeded");
    this.name = "MicrosoftFreeBusyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MicrosoftFreeBusyServerError extends Error {
  readonly retryAfterSeconds: number | undefined;
  readonly statusCode: number;
  constructor(statusCode: number, retryAfterSeconds: number | undefined) {
    super(`Microsoft FreeBusy server error: ${statusCode}`);
    this.name = "MicrosoftFreeBusyServerError";
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
