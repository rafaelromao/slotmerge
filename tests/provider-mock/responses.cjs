const GOOGLE_TOKEN_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
const MICROSOFT_CALENDAR_SCOPE = "offline_access Calendars.ReadBasic";
const DEFAULT_ACCESS_TOKEN = "mock-access-token";
const DEFAULT_REFRESH_TOKEN = "mock-refresh-token";
const DEFAULT_EXPIRES_IN = 3600;
const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
const DEFAULT_MICROSOFT_CALENDAR_ID = "mock-primary-calendar-id";

function parseJsonBody(input) {
  if (input == null) return {};
  if (typeof input === "string") {
    if (input.length === 0) return {};
    return JSON.parse(input);
  }
  return input;
}

function mapGoogleIntervals(intervals) {
  return {
    busy: intervals
      .filter((i) => i.status === "busy")
      .map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString() })),
    outOfOffice: intervals
      .filter((i) => i.status === "out-of-office")
      .map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString() })),
    tentative: intervals
      .filter(
        (i) => i.status === "tentative" || i.status === "working-elsewhere",
      )
      .map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString() })),
  };
}

function buildGoogleTokenResponse(options) {
  const opts = options ?? {};
  return {
    access_token: opts.accessToken ?? DEFAULT_ACCESS_TOKEN,
    refresh_token: opts.refreshToken ?? DEFAULT_REFRESH_TOKEN,
    expires_in: opts.expiresIn ?? DEFAULT_EXPIRES_IN,
    scope: opts.scope ?? GOOGLE_TOKEN_SCOPE,
    token_type: "Bearer",
  };
}

function buildGoogleFreeBusyResponse(input, options) {
  const opts = options ?? {};
  const freeBusyResponses = opts.freeBusyResponses ?? new Map();
  const defaultCalendarId =
    opts.defaultCalendarId ?? DEFAULT_GOOGLE_CALENDAR_ID;
  const body = parseJsonBody(input);
  const items = body.items ?? [{ id: defaultCalendarId }];
  const calendars = {};
  for (const item of items) {
    const intervals = freeBusyResponses.get(item.id) ?? [];
    calendars[item.id] = mapGoogleIntervals(intervals);
  }
  return {
    kind: "calendar#freeBusy",
    timeMin: body.timeMin,
    timeMax: body.timeMax,
    calendars,
  };
}

function buildGoogleErrorResponse(status, retryAfterSeconds) {
  const headers = { "content-type": "application/json" };
  if (retryAfterSeconds !== undefined) {
    headers["retry-after"] = String(retryAfterSeconds);
  }
  return {
    status,
    headers,
    body: JSON.stringify({ error: "Server Error" }),
  };
}

function buildMicrosoftTokenResponse(scope, options) {
  const opts = options ?? {};
  if (opts.accountKind === "personal") {
    return {
      status: 400,
      body: {
        error: "access_denied",
        error_description:
          "The Microsoft personal accounts are not supported. Use a work or school account.",
      },
    };
  }
  return {
    status: 200,
    body: {
      access_token: opts.accessToken ?? DEFAULT_ACCESS_TOKEN,
      refresh_token: opts.refreshToken ?? DEFAULT_REFRESH_TOKEN,
      expires_in: opts.expiresIn ?? DEFAULT_EXPIRES_IN,
      scope: opts.scope ?? MICROSOFT_CALENDAR_SCOPE,
      token_type: "Bearer",
    },
  };
}

function buildMicrosoftCalendarsResponse(options) {
  const opts = options ?? {};
  const id = opts.primaryCalendarId ?? DEFAULT_MICROSOFT_CALENDAR_ID;
  return {
    value: [{ id, isPrimaryCalendar: true }],
  };
}

function buildMicrosoftGetScheduleResponse(input, options) {
  const opts = options ?? {};
  const scheduleResponses = opts.scheduleResponses ?? new Map();
  const body = parseJsonBody(input);
  const schedules = body.schedules ?? [];
  const value = schedules.map((scheduleId) => {
    const configured = scheduleResponses.get(scheduleId);
    return {
      scheduleId,
      availabilityView: configured?.availabilityView ?? "0",
      calendarEvents: configured?.scheduleItems ?? [],
    };
  });
  return { value };
}

module.exports = {
  GOOGLE_TOKEN_SCOPE,
  MICROSOFT_CALENDAR_SCOPE,
  DEFAULT_ACCESS_TOKEN,
  DEFAULT_REFRESH_TOKEN,
  DEFAULT_EXPIRES_IN,
  DEFAULT_GOOGLE_CALENDAR_ID,
  DEFAULT_MICROSOFT_CALENDAR_ID,
  parseJsonBody,
  buildGoogleTokenResponse,
  buildGoogleFreeBusyResponse,
  buildGoogleErrorResponse,
  buildMicrosoftTokenResponse,
  buildMicrosoftCalendarsResponse,
  buildMicrosoftGetScheduleResponse,
};
