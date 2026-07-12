import { timingSafeEqual } from "node:crypto";

import {
  getSessionFromRequest,
  getSessionSecret,
} from "../../../../../src/auth/session";
import {
  startMicrosoftCalendarConnection,
  presentMicrosoftCalendarConnection,
} from "../../../../../src/calendar/microsoft-calendar-connections";
import { getMicrosoftCalendarConnectionRepository } from "../../../../../src/calendar/repository";

export async function POST(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;

  if (!clientId) {
    return Response.json(
      { error: "microsoft_oauth_not_configured" },
      { status: 500 },
    );
  }

  const connection = await startMicrosoftCalendarConnection({
    baseUrl: new URL(request.url).origin,
    clientId,
    csrfToken: session.csrfToken,
    repository: getMicrosoftCalendarConnectionRepository(),
    sessionSecret: getSessionSecret(),
    userId: session.user.id,
  });

  return Response.json({
    authorizationUrl: connection.authorizationUrl,
    connection: presentMicrosoftCalendarConnection(connection.connection),
  });
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
