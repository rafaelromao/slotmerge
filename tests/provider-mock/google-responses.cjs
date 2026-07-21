const ACCESS_TOKEN = "mock-access-token";
const REFRESH_TOKEN = "mock-refresh-token";
const CALENDAR_ID = "primary";

function buildGoogleTokenResponse() {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 3600,
    scope: "https://www.googleapis.com/auth/calendar.freebusy",
    token_type: "Bearer",
  };
}

function buildGoogleFreeBusyResponse(body) {
  const data = typeof body === "string" ? JSON.parse(body) : body;
  const items = data.items || [{ id: CALENDAR_ID }];
  const calendars = {};
  for (const item of items) {
    calendars[item.id] = { busy: [] };
  }
  return {
    kind: "calendar#freeBusy",
    timeMin: data.timeMin,
    timeMax: data.timeMax,
    calendars,
  };
}

module.exports = {
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  CALENDAR_ID,
  buildGoogleTokenResponse,
  buildGoogleFreeBusyResponse,
};
