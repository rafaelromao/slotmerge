import { getSessionFromRequest } from "../../../../../src/auth/session";
import { decryptCalendarToken } from "../../../../../src/calendar/token-encryption";
import { findCalendarConnectionById } from "../../../../../src/calendar/repository";

const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

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

  if (connection.provider === "google") {
    decryptCalendarToken({
      ciphertext: connection.accessTokenEncrypted ?? "",
      key: tokenEncryptionKey,
    });

    const primaryIncluded =
      connection.contributingCalendarIds.includes("primary");

    return Response.json({
      calendars: [
        {
          id: "primary",
          name: "Primary Calendar",
          isPrimary: true,
          isIncluded: primaryIncluded,
        },
      ],
    });
  }

  const accessToken = decryptCalendarToken({
    ciphertext: connection.accessTokenEncrypted ?? "",
    key: tokenEncryptionKey,
  });

  const calendarsResult = await fetchMicrosoftCalendars(accessToken);

  if (!calendarsResult.ok) {
    return Response.json(
      { error: "failed_to_fetch_calendars" },
      { status: 502 },
    );
  }

  const calendars = calendarsResult.calendars;
  const includedIds = new Set(connection.contributingCalendarIds);
  const calendarsWithStatus = calendars.map((cal) => ({
    id: cal.id,
    name: cal.name,
    isPrimary: cal.isPrimaryCalendar,
    isIncluded: includedIds.has(cal.id),
  }));

  return Response.json({
    calendars: calendarsWithStatus,
  });
}

type MicrosoftCalendar = {
  id: string;
  name: string;
  isPrimaryCalendar: boolean;
};

async function fetchMicrosoftCalendars(
  accessToken: string,
): Promise<{ ok: true; calendars: MicrosoftCalendar[] } | { ok: false }> {
  const response = await fetch(
    `${MICROSOFT_GRAPH_ENDPOINT}/me/calendars?$select=id,name,isPrimaryCalendar`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    return { ok: false };
  }

  const data = (await response.json()) as {
    value?: MicrosoftCalendar[];
  };

  return { ok: true, calendars: data.value ?? [] };
}
