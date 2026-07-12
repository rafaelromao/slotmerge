import { getSessionFromRequest } from "../../../../../src/auth/session";
import { decryptCalendarToken } from "../../../../../src/calendar/token-encryption";
import { findCalendarConnectionById } from "../../../../../src/calendar/repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: expectedId } = await params;

  const found = await findCalendarConnectionById(expectedId);

  if (!found) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  if (found.record.userId !== session.user.id) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncryptionKey) {
    return Response.json({ error: "oauth_not_configured" }, { status: 500 });
  }

  if (found.provider === "google") {
    decryptCalendarToken({
      ciphertext: found.record.accessTokenEncrypted ?? "",
      key: tokenEncryptionKey,
    });

    const primaryIncluded =
      found.record.contributingCalendarIds.includes("primary");

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
    ciphertext: found.record.accessTokenEncrypted ?? "",
    key: tokenEncryptionKey,
  });

  const calendars = await fetchMicrosoftCalendars(accessToken);

  const includedIds = new Set(found.record.contributingCalendarIds);
  const calendarsWithStatus = calendars.map((cal) => ({
    ...cal,
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
): Promise<MicrosoftCalendar[]> {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,isPrimaryCalendar",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Microsoft calendars");
  }

  const data = (await response.json()) as {
    value?: MicrosoftCalendar[];
  };

  return data.value ?? [];
}
