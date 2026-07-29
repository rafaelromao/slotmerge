import { getSessionFromRequest } from "../../../../../src/auth/session";
import {
  listProviderCalendarsForProvider,
  getCalendarProvider,
} from "../../../../../src/calendar/providers";
import { findCalendarConnectionById } from "../../../../../src/calendar/repository";
import { decryptCalendarToken } from "../../../../../src/calendar/token-encryption";
import { configuredProviderFetchImpl } from "../../../../../src/lib/fetch-wrapper";
import { systemClock } from "../../../../../src/system/clock";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request, {
    clock: systemClock(),
  });

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: expectedId } = await params;

  const connection = await findCalendarConnectionById(
    expectedId,
    systemClock(),
  );

  if (!connection) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  if (connection.userId !== session.user.id) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncryptionKey) {
    return Response.json({ error: "oauth_not_configured" }, { status: 500 });
  }

  const accessToken = decryptCalendarToken({
    ciphertext: connection.accessTokenEncrypted ?? "",
    key: tokenEncryptionKey,
  });

  const fetchImpl = configuredProviderFetchImpl();

  const provider = getCalendarProvider(connection.provider);
  const providerCalendars = await listProviderCalendarsForProvider(
    provider,
    accessToken,
    fetchImpl,
  );

  const includedIds = new Set(connection.contributingCalendarIds);
  const calendars = providerCalendars.map((cal) => ({
    id: cal.id,
    name: cal.name,
    isPrimary: cal.isPrimary,
    isIncluded: includedIds.has(cal.id),
  }));

  return Response.json({ calendars });
}
