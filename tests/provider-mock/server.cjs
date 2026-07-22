const http = require("node:http");
const {
  buildGoogleTokenResponse,
  buildGoogleFreeBusyResponse,
  buildMicrosoftTokenResponse,
  buildMicrosoftCalendarsResponse,
  buildMicrosoftGetScheduleResponse,
} = require("./responses.cjs");

const PORT = Number(process.env.PROVIDER_MOCK_PORT || 3001);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const contentType = (req.headers["content-type"] || "").toLowerCase();
      const isJson = contentType.includes("application/json");
      try {
        if (isJson) {
          resolve(body.length === 0 ? {} : JSON.parse(body));
          return;
        }
        const params = new URLSearchParams(body);
        const obj = {};
        for (const [key, value] of params) {
          obj[key] = value;
        }
        resolve(obj);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
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
const MICROSOFT_LOGOUT_ENDPOINT = "/microsoft/logout";
const MICROSOFT_CALENDARS_ENDPOINT = "/microsoft/calendars";
const MICROSOFT_GETSCHEDULE_ENDPOINT = "/microsoft/getSchedule";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === GOOGLE_TOKEN_ENDPOINT && req.method === "POST") {
      const body = await parseBody(req);
      jsonResponse(res, 200, buildGoogleTokenResponse());
      return;
    }

    if (path === GOOGLE_REVOKE_ENDPOINT && req.method === "POST") {
      jsonResponse(res, 200, {});
      return;
    }

    if (path === MICROSOFT_TOKEN_ENDPOINT && req.method === "POST") {
      const body = await parseBody(req);
      const scope = typeof body.scope === "string" ? body.scope : "";
      const result = buildMicrosoftTokenResponse(scope);
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (path === MICROSOFT_LOGOUT_ENDPOINT && req.method === "POST") {
      jsonResponse(res, 200, {});
      return;
    }

    if (path === GOOGLE_FREEBUSY_ENDPOINT && req.method === "POST") {
      const body = await parseBody(req);
      jsonResponse(res, 200, buildGoogleFreeBusyResponse(body));
      return;
    }

    if (path === MICROSOFT_CALENDARS_ENDPOINT && req.method === "GET") {
      jsonResponse(res, 200, buildMicrosoftCalendarsResponse());
      return;
    }

    if (path === MICROSOFT_GETSCHEDULE_ENDPOINT && req.method === "POST") {
      const body = await parseBody(req);
      jsonResponse(res, 200, buildMicrosoftGetScheduleResponse(body));
      return;
    }

    res.writeHead(404);
    res.end();
  } catch (err) {
    console.error("Provider mock error:", err);
    jsonResponse(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Provider mock server running on port ${PORT}`);
});
