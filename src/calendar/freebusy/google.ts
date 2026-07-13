import type { FreeBusyInterval } from "./types";
import {
  GoogleFreeBusyAuthError,
  GoogleFreeBusyRateLimitError,
  GoogleFreeBusyServerError,
} from "./types";

const GOOGLE_FREE_BUSY_URL =
  "https://calendar.googleapis.com/calendar/v3/freeBusy";

export async function fetchGoogleFreeBusy(params: {
  accessToken: string;
  calendarIds: string[];
  timeMin: string;
  timeMax: string;
  fetchImpl: typeof fetch;
}): Promise<FreeBusyInterval[]> {
  const { accessToken, calendarIds, timeMin, timeMax, fetchImpl } = params;

  const response = await fetchImpl(GOOGLE_FREE_BUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new GoogleFreeBusyAuthError();
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfterHeader(
      response.headers.get("retry-after"),
    );
    throw new GoogleFreeBusyRateLimitError(retryAfter);
  }

  if (response.status >= 500) {
    const retryAfter = parseRetryAfterHeader(
      response.headers.get("retry-after"),
    );
    throw new GoogleFreeBusyServerError(response.status, retryAfter);
  }

  if (!response.ok) {
    throw new Error(`Google FreeBusy request failed: ${response.status}`);
  }

  const data = (await response.json()) as GoogleFreeBusyResponse;

  const intervals: FreeBusyInterval[] = [];

  for (const calendarId of calendarIds) {
    const calendarData = data.calendars?.[calendarId];
    if (!calendarData) continue;

    for (const busy of calendarData.busy ?? []) {
      intervals.push({
        providerCalendarId: calendarId,
        eventId: busy.id,
        status: "busy",
        startAt: new Date(busy.start),
        endAt: new Date(busy.end),
      });
    }

    for (const ooo of calendarData.outOfOffice ?? []) {
      const startStr = ooo.startTime ?? ooo.start;
      const endStr = ooo.endTime ?? ooo.end;
      if (startStr && endStr) {
        intervals.push({
          providerCalendarId: calendarId,
          status: "out-of-office",
          startAt: new Date(startStr),
          endAt: new Date(endStr),
        });
      }
    }
  }

  return intervals;
}

function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  return isNaN(seconds) ? undefined : seconds;
}

type GoogleFreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: Array<{ start: string; end: string; id?: string }>;
      outOfOffice?: Array<{
        startTime?: string;
        endTime?: string;
        start?: string;
        end?: string;
      }>;
    }
  >;
};
