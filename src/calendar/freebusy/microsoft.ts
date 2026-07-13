import type { BusyIntervalStatus } from "../../db/schema";
import type { FreeBusyInterval } from "./types";
import {
  MicrosoftFreeBusyAuthError,
  MicrosoftFreeBusyRateLimitError,
  MicrosoftFreeBusyServerError,
} from "./types";

const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

export async function fetchMicrosoftFreeBusy(params: {
  accessToken: string;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
  fetchImpl: typeof fetch;
}): Promise<FreeBusyInterval[]> {
  const { accessToken, calendarIds, timeMin, timeMax, fetchImpl } = params;

  const response = await fetchImpl(
    `${MICROSOFT_GRAPH_ENDPOINT}/me/calendar/getSchedule`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schedules: calendarIds,
        startTime: { dateTime: timeMin, timeZone: "UTC" },
        endTime: { dateTime: timeMax, timeZone: "UTC" },
      }),
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new MicrosoftFreeBusyAuthError();
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(response.headers.get("retry-after"));
    throw new MicrosoftFreeBusyRateLimitError(retryAfter);
  }

  if (response.status >= 500) {
    const retryAfter = parseRetryAfterHeader(response.headers.get("retry-after"));
    const error = new MicrosoftFreeBusyServerError(response.status);
    (error as unknown as { retryAfterSeconds: number | undefined }).retryAfterSeconds = retryAfter;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Microsoft FreeBusy request failed: ${response.status}`);
  }

  const data = (await response.json()) as MicrosoftGetScheduleResponse;

  const intervals: FreeBusyInterval[] = [];

  for (const schedule of data.value ?? []) {
    for (const event of schedule.calendarEvents ?? []) {
      if (!event.isBusy && event.showAs !== "oof" && event.showAs !== "tentative") {
        continue;
      }

      const status = mapShowAsToStatus(event.showAs, event.isBusy ?? false);

      intervals.push({
        providerCalendarId: schedule.scheduleId,
        status,
        startAt: new Date(event.start.dateTime),
        endAt: new Date(event.end.dateTime),
      });
    }
  }

  return intervals;
}

function mapShowAsToStatus(
  showAs: string | undefined,
  isBusy: boolean | undefined,
): BusyIntervalStatus {
  switch (showAs) {
    case "oof":
      return "out-of-office";
    case "tentative":
      return "tentative";
    default:
      return isBusy ? "busy" : "tentative";
  }
}

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  return isNaN(seconds) ? undefined : seconds;
}

type MicrosoftGetScheduleResponse = {
  value?: Array<{
    scheduleId: string;
    availabilityView?: string;
    calendarEvents?: Array<{
      subject?: string;
      isBusy?: boolean;
      showAs?: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    }>;
  }>;
};
