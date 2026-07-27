import { getSessionFromRequest } from "../../../../../src/auth/session";
import {
  listProviderCalendarsForProvider,
  getCalendarProvider,
} from "../../../../../src/calendar/providers";
import { findCalendarConnectionById } from "../../../../../src/calendar/repository";
import { decryptCalendarToken } from "../../../../../src/calendar/token-encryption";
import { createProviderFetchImpl } from "../../../../../src/lib/fetch-wrapper";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: expectedId } = await params;

  const connection = await findCalendarConnectionById(expectedId);

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

  const isLocalOrTest =
    process.env.APP_ENV === "local" || process.env.APP_ENV === "test";
  const overrideUrl = process.env.LOCAL_PROVIDER_OVERRIDE_URL;
  const fetchImpl =
    isLocalOrTest &&
    process.env.CALENDAR_PROVIDER_MODE === "mock" &&
    overrideUrl
      ? createProviderFetchImpl(fetch, overrideUrl)
      : fetch;

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
