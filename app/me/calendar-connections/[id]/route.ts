import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../../src/auth/session";
import {
  presentGoogleCalendarConnection,
  revokeGoogleCalendarConnection,
} from "../../../../src/calendar/google-calendar-connections";
import {
  presentMicrosoftCalendarConnection,
  revokeMicrosoftCalendarConnection,
} from "../../../../src/calendar/microsoft-calendar-connections";
import {
  findCalendarConnectionById,
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "../../../../src/calendar/repository";

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
    return Response.json({ error: "oauth_not_configured" }, { status: 500 });
  }

  const found = await findCalendarConnectionById(expectedId);

  if (!found) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  if (found.provider === "microsoft") {
    const connection = await revokeMicrosoftCalendarConnection({
      connectionId: expectedId,
      fetchImpl: fetch,
      repository: getMicrosoftCalendarConnectionRepository(),
      tokenEncryptionKey,
    });
    return Response.json({
      connection: presentMicrosoftCalendarConnection(connection),
    });
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
