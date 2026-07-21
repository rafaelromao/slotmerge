const http = require("http");
const {
  buildGoogleTokenResponse,
  buildGoogleFreeBusyResponse,
} = require("./google-responses.cjs");
const {
  buildMicrosoftTokenResponse,
  buildMicrosoftCalendarsResponse,
  buildMicrosoftGetScheduleResponse,
} = require("./microsoft-responses.cjs");

const PORT = Number(process.env.PROVIDER_MOCK_PORT || 3001);

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
        jsonResponse(res, 200, buildGoogleTokenResponse());
        return;
      }

      if (path === GOOGLE_REVOKE_ENDPOINT) {
        jsonResponse(res, 200, {});
        return;
      }

      if (path === MICROSOFT_TOKEN_ENDPOINT) {
        const scope = body.scope || "";
        const response = buildMicrosoftTokenResponse(scope);
        const status = response.error ? 400 : 200;
        jsonResponse(res, status, response);
        return;
      }

      if (path === GOOGLE_FREEBUSY_ENDPOINT) {
        jsonResponse(res, 200, buildGoogleFreeBusyResponse(body));
        return;
      }

      if (path === MICROSOFT_CALENDARS_ENDPOINT) {
        jsonResponse(res, 200, buildMicrosoftCalendarsResponse());
        return;
      }

      if (path === MICROSOFT_GETSCHEDULE_ENDPOINT) {
        jsonResponse(res, 200, buildMicrosoftGetScheduleResponse(body));
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
