const ACCESS_TOKEN = "mock-access-token";
const REFRESH_TOKEN = "mock-refresh-token";
const CALENDAR_ID = "mock-primary-calendar-id";

function buildMicrosoftTokenResponse(scope) {
  if (scope && scope.includes("Calendars.ReadBasic")) {
    return {
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      expires_in: 3600,
      scope: "offline_access Calendars.ReadBasic",
      token_type: "Bearer",
    };
  }
  return {
    error: "invalid_scope",
    error_description: "Unsupported scope",
  };
}

function buildMicrosoftCalendarsResponse() {
  return {
    value: [{ id: CALENDAR_ID, isPrimaryCalendar: true }],
  };
}

function buildMicrosoftGetScheduleResponse(body) {
  const data = typeof body === "string" ? JSON.parse(body) : body;
  const schedules = data.schedules || [];
  const result = schedules.map(function(scheduleId) {
    return {
      scheduleId: scheduleId,
      availabilityView: "0",
      calendarEvents: [],
    };
  });
  return { value: result };
}

module.exports = {
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  CALENDAR_ID,
  buildMicrosoftTokenResponse,
  buildMicrosoftCalendarsResponse,
  buildMicrosoftGetScheduleResponse,
};
