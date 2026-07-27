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

function redirectResponse(res, location) {
  res.writeHead(303, { Location: location });
  res.end();
}

const GOOGLE_AUTHORIZE_ENDPOINT = "/google/authorize";
const GOOGLE_TOKEN_ENDPOINT = "/google/token";
const GOOGLE_REVOKE_ENDPOINT = "/google/revoke";
const GOOGLE_FREEBUSY_ENDPOINT = "/google/freebusy";
const MICROSOFT_AUTHORIZE_ENDPOINT = "/microsoft/authorize";
const MICROSOFT_TOKEN_ENDPOINT = "/microsoft/token";
const MICROSOFT_LOGOUT_ENDPOINT = "/microsoft/logout";
const MICROSOFT_CALENDARS_ENDPOINT = "/microsoft/calendars";
const MICROSOFT_GETSCHEDULE_ENDPOINT = "/microsoft/getSchedule";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (
      (path === GOOGLE_AUTHORIZE_ENDPOINT ||
        path === MICROSOFT_AUTHORIZE_ENDPOINT) &&
      req.method === "GET"
    ) {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      if (!redirectUri || !state) {
        jsonResponse(res, 400, { error: "invalid_authorization_request" });
        return;
      }
      const provider = path.startsWith("/google") ? "google" : "microsoft";
      const defaultScenario =
        provider === "microsoft" ? "personal" : "connected";
      const scenario = url.searchParams.get("scenario") || defaultScenario;
      const callback = new URL(redirectUri);
      callback.searchParams.set("state", state);
      if (scenario === "denied") {
        callback.searchParams.set("error", "access_denied");
      } else {
        callback.searchParams.set("code", `${provider}-${scenario}`);
      }
      redirectResponse(res, callback.toString());
      return;
    }

    if (path === GOOGLE_TOKEN_ENDPOINT && req.method === "POST") {
      const body = await parseBody(req);
      if (body.code === "google-provider_failure") {
        jsonResponse(res, 500, { error: "provider_failure" });
        return;
      }
      const expired = body.code === "google-expired";
      jsonResponse(
        res,
        200,
        buildGoogleTokenResponse({
          accessToken: expired ? "expired-access-token" : undefined,
          expiresIn: expired ? 0 : undefined,
        }),
      );
      return;
    }

    if (path === GOOGLE_REVOKE_ENDPOINT && req.method === "POST") {
      jsonResponse(res, 200, {});
      return;
    }

    if (path === MICROSOFT_TOKEN_ENDPOINT && req.method === "POST") {
      const body = await parseBody(req);
      const scope = typeof body.scope === "string" ? body.scope : "";
      const accountKind =
        body.code === "microsoft-personal" ? "personal" : "work";
      const result = buildMicrosoftTokenResponse(scope, { accountKind });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (path === MICROSOFT_LOGOUT_ENDPOINT && req.method === "POST") {
      jsonResponse(res, 200, {});
      return;
    }

    if (path === GOOGLE_FREEBUSY_ENDPOINT && req.method === "POST") {
      if (req.headers.authorization === "Bearer expired-access-token") {
        jsonResponse(res, 401, { error: "invalid_token" });
        return;
      }
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
