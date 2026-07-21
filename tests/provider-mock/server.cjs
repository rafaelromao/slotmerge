const http = require("http");

const PORT = Number(process.env.PROVIDER_MOCK_PORT || 3001);
const ACCESS_TOKEN = "mock-access-token";
const REFRESH_TOKEN = "mock-refresh-token";
const CALENDAR_ID = "primary";

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const params = new URLSearchParams(body);
        const obj = {};
        for (const [key, value] of params) {
          obj[key] = value;
        }
        resolve(obj);
      } catch {
        try {
          obj = JSON.parse(body);
          resolve(obj);
        } catch {
          reject(new Error("Failed to parse body"));
        }
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const GOOGLE_TOKEN_ENDPOINT = "/google/token";
const GOOGLE_REVOKE_ENDPOINT = "/google/revoke";
const GOOGLE_FREEBUSY_ENDPOINT = "/google/freebusy";
const MICROSOFT_TOKEN_ENDPOINT = "/microsoft/token";
const MICROSOFT_CALENDARS_ENDPOINT = "/microsoft/calendars";
const MICROSOFT_GETSCHEDULE_ENDPOINT = "/microsoft/getSchedule";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);

      if (path === GOOGLE_TOKEN_ENDPOINT) {
        jsonResponse(res, 200, {
          access_token: ACCESS_TOKEN,
          refresh_token: REFRESH_TOKEN,
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/calendar.freebusy",
          token_type: "Bearer",
        });
        return;
      }

      if (path === GOOGLE_REVOKE_ENDPOINT) {
        jsonResponse(res, 200, {});
        return;
      }

      if (path === MICROSOFT_TOKEN_ENDPOINT) {
        const scope = body.scope || "";
        if (scope.includes("Calendars.ReadBasic")) {
          jsonResponse(res, 200, {
            access_token: ACCESS_TOKEN,
            refresh_token: REFRESH_TOKEN,
            expires_in: 3600,
            scope: "offline_access Calendars.ReadBasic",
            token_type: "Bearer",
          });
        } else {
          jsonResponse(res, 400, {
            error: "invalid_scope",
            error_description: "Unsupported scope",
          });
        }
        return;
      }

      if (path === GOOGLE_FREEBUSY_ENDPOINT) {
        const data = typeof body === "string" ? JSON.parse(body) : body;
        const items = data.items || [{ id: CALENDAR_ID }];
        const calendars = {};
        for (const item of items) {
          calendars[item.id] = { busy: [] };
        }
        jsonResponse(res, 200, {
          kind: "calendar#freeBusy",
          timeMin: data.timeMin,
          timeMax: data.timeMax,
          calendars,
        });
        return;
      }

      if (path === MICROSOFT_CALENDARS_ENDPOINT) {
        jsonResponse(res, 200, {
          value: [{ id: CALENDAR_ID, isPrimaryCalendar: true }],
        });
        return;
      }

      if (path === MICROSOFT_GETSCHEDULE_ENDPOINT) {
        const data = typeof body === "string" ? JSON.parse(body) : body;
        const schedules = data.schedules || [];
        const result = schedules.map((scheduleId) => ({
          scheduleId,
          availabilityView: "0",
          calendarEvents: [],
        }));
        jsonResponse(res, 200, { value: result });
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      console.error("Provider mock error:", err);
      jsonResponse(res, 500, { error: "Internal server error" });
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Provider mock server running on port ${PORT}`);
});
