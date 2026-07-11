import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../../src/auth/session";
import {
  presentGoogleCalendarConnection,
  revokeGoogleCalendarConnection,
} from "../../../../src/calendar/google-calendar-connections";
import { getGoogleCalendarConnectionRepository } from "../../../../src/calendar/repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: expectedId } = await params;
  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncryptionKey) {
    return Response.json(
      { error: "google_oauth_not_configured" },
      { status: 500 },
    );
  }

  const connection = await revokeGoogleCalendarConnection({
    connectionId: expectedId,
    fetchImpl: fetch,
    repository: getGoogleCalendarConnectionRepository(),
    tokenEncryptionKey,
  });

  return Response.json({
    connection: presentGoogleCalendarConnection(connection),
  });
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
