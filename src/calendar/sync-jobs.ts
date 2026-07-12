import { randomInt } from "node:crypto";

import type { BusyIntervalStatus } from "../db/schema";
import { type GoogleCalendarConnectionRecord } from "./google-calendar-connections";
import { type MicrosoftCalendarConnectionRecord } from "./microsoft-calendar-connections";
import { type ImportedBusyIntervalRecord } from "./imported-busy-intervals";
import { recordCalendarConnectionSyncFailure } from "./sync-failure-recorder";

export const calendarSyncTaskName = "calendar_sync";

export class RateLimitError extends Error {
  readonly code = "rate-limited";
  constructor(readonly retryAfterSeconds?: number) {
    super(`Rate limited, retry after ${retryAfterSeconds}s`);
    this.name = "RateLimitError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type CalendarSyncJobPayload = {
  connectionId: string;
  attempt?: number;
};

export type CalendarSyncResult =
  | { status: "success" }
  | { status: "skipped"; reason: "not_connected" }
  | { status: "failed" }
  | { status: "retry_scheduled"; retryAfterMs: number };

export type CalendarConnectionLookup = {
  findById(
    id: string,
  ): Promise<
    | { provider: "google"; record: GoogleCalendarConnectionRecord }
    | { provider: "microsoft"; record: MicrosoftCalendarConnectionRecord }
    | null
  >;
};

export type DecryptToken = (encrypted: string) => string;

export type GoogleBusyInterval = {
  providerCalendarId: string;
  providerEventReference: string | null;
  status: BusyIntervalStatus;
  startAt: Date;
  endAt: Date;
};

export type MicrosoftBusyInterval = {
  providerCalendarId: string;
  providerEventReference: string | null;
  status: BusyIntervalStatus;
  startAt: Date;
  endAt: Date;
};

export type CalendarSyncJobDeps = {
  findConnectionById: CalendarConnectionLookup["findById"];
  decryptAccessToken: DecryptToken;
  fetchGoogleFreeBusy(params: {
    accessToken: string;
    calendarIds: string[];
    timeMin: Date;
    timeMax: Date;
  }): Promise<GoogleBusyInterval[]>;
  fetchMicrosoftFreeBusy(params: {
    accessToken: string;
    calendarIds: string[];
    timeMin: Date;
    timeMax: Date;
  }): Promise<MicrosoftBusyInterval[]>;
  upsertBusyIntervals(intervals: ImportedBusyIntervalRecord[]): Promise<void>;
  recordSyncFailure: typeof recordCalendarConnectionSyncFailure;
  enqueueSync(
    connectionId: string,
    backoffMs?: number,
    attempt?: number,
  ): Promise<void>;
  clock(): Date;
};

let depsOverride: CalendarSyncJobDeps | null = null;

export function setCalendarSyncJobForTests(d: CalendarSyncJobDeps | null) {
  depsOverride = d;
}

function getDeps(): CalendarSyncJobDeps {
  if (!depsOverride) {
    throw new Error("Calendar sync job deps not configured for tests");
  }
  return depsOverride;
}

export async function handleCalendarSyncJob(
  payload: CalendarSyncJobPayload,
  deps?: CalendarSyncJobDeps,
): Promise<CalendarSyncResult> {
  const resolvedDeps = deps ?? getDeps();
  const { connectionId, attempt = 1 } = payload;

  const connectionResult = await resolvedDeps.findConnectionById(connectionId);
  if (!connectionResult || connectionResult.record.status !== "connected") {
    return { status: "skipped", reason: "not_connected" };
  }

  const { record: connection } = connectionResult;

  const timeMin = resolvedDeps.clock();
  const timeMax = new Date(timeMin.getTime() + 90 * 24 * 60 * 60 * 1000);

  let busyIntervals: ImportedBusyIntervalRecord[];

  try {
    if (connectionResult.provider === "google") {
      const accessToken = resolvedDeps.decryptAccessToken(
        connection.accessTokenEncrypted ?? "",
      );
      const googleIntervals = await resolvedDeps.fetchGoogleFreeBusy({
        accessToken,
        calendarIds: ["primary"],
        timeMin,
        timeMax,
      });
      busyIntervals = googleIntervals.map((interval) => ({
        id: `${connectionId}-${interval.providerCalendarId}-${interval.startAt.getTime()}`,
        userId: connection.userId,
        connectionId,
        providerCalendarId: interval.providerCalendarId,
        providerEventReference: interval.providerEventReference,
        status: interval.status,
        startAt: interval.startAt,
        endAt: interval.endAt,
        importedAt: timeMin,
      }));
    } else {
      const accessToken = resolvedDeps.decryptAccessToken(
        connection.accessTokenEncrypted ?? "",
      );
      const microsoftIntervals = await resolvedDeps.fetchMicrosoftFreeBusy({
        accessToken,
        calendarIds: ["user@example.com"],
        timeMin,
        timeMax,
      });
      busyIntervals = microsoftIntervals.map((interval) => ({
        id: `${connectionId}-${interval.providerCalendarId}-${interval.startAt.getTime()}`,
        userId: connection.userId,
        connectionId,
        providerCalendarId: interval.providerCalendarId,
        providerEventReference: interval.providerEventReference,
        status: interval.status,
        startAt: interval.startAt,
        endAt: interval.endAt,
        importedAt: timeMin,
      }));
    }

    await resolvedDeps.upsertBusyIntervals(busyIntervals);
    return { status: "success" };
  } catch (error) {
    if (error instanceof RateLimitError) {
      const depsArg = {
        connectionLookup: resolvedDeps.findConnectionById as any, // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      };
      await resolvedDeps.recordSyncFailure(
        {
          connectionId,
          provider: connectionResult.provider,
          code: error.code,
          message: error.message,
        },
        depsArg,
      );

      const retryAfterMs = error.retryAfterSeconds
        ? Math.min(
            error.retryAfterSeconds * 2 * 1000 * 2 ** (attempt - 1),
            900_000,
          )
        : Math.min(30_000 * 2 ** (attempt - 1) + randomInt(0, 15_000), 900_000);

      await resolvedDeps.enqueueSync(connectionId, retryAfterMs, attempt + 1);
      return { status: "retry_scheduled", retryAfterMs };
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const depsArg = {
      connectionLookup: resolvedDeps.findConnectionById as any, // eslint-disable-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    };
    await resolvedDeps.recordSyncFailure(
      {
        connectionId,
        provider: connectionResult.provider,
        code: err instanceof ApiError ? err.code : "unknown",
        message: err.message ?? "Sync failed",
      },
      depsArg,
    );

    return { status: "failed" };
  }
}

export async function enqueueCalendarSync(
  connectionId: string,
  backoffMs?: number,
): Promise<void> {
  const deps = getDeps();
  await deps.enqueueSync(connectionId, backoffMs);
}

export async function fetchGoogleFreeBusyRaw(
  accessToken: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleBusyInterval[]> {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
    },
  );

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const message =
      body?.error?.message ?? `Google API error: ${response.status}`;
    throw new ApiError(
      response.status === 401 ? "unauthorized" : "api_error",
      message,
    );
  }

  const data = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };

  const intervals: GoogleBusyInterval[] = [];
  for (const [calendarId, calendarData] of Object.entries(
    data.calendars ?? {},
  )) {
    for (const busy of calendarData.busy ?? []) {
      intervals.push({
        providerCalendarId: calendarId,
        providerEventReference: null,
        status: "busy",
        startAt: new Date(busy.start),
        endAt: new Date(busy.end),
      });
    }
  }

  return intervals;
}

export async function fetchMicrosoftFreeBusyRaw(
  accessToken: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<MicrosoftBusyInterval[]> {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schedules: calendarIds,
        startTime: {
          dateTime: timeMin.toISOString(),
          timeZone: "UTC",
        },
        endTime: {
          dateTime: timeMax.toISOString(),
          timeZone: "UTC",
        },
        availabilityViewInterval: 30,
      }),
    },
  );

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const message =
      body?.error?.message ?? `Microsoft API error: ${response.status}`;
    throw new ApiError(
      response.status === 401 ? "unauthorized" : "api_error",
      message,
    );
  }

  const data = (await response.json()) as {
    value?: Array<{
      scheduleId: string;
      availabilityView?: string;
      scheduleItems?: Array<{
        start: string;
        end: string;
        status: string;
        subject?: string;
      }>;
    }>;
  };

  const intervals: MicrosoftBusyInterval[] = [];
  for (const schedule of data.value ?? []) {
    for (const item of schedule.scheduleItems ?? []) {
      let status: BusyIntervalStatus = "busy";
      if (item.status === "oof") status = "out-of-office";
      else if (item.status === "tentative") status = "tentative";

      intervals.push({
        providerCalendarId: schedule.scheduleId,
        providerEventReference: null,
        status,
        startAt: new Date(item.start),
        endAt: new Date(item.end),
      });
    }
  }

  return intervals;
}
