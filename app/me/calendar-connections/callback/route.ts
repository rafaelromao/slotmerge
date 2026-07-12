import { getSessionSecret } from "../../../../src/auth/session";
import {
  completeGoogleCalendarConnection,
  presentGoogleCalendarConnection,
} from "../../../../src/calendar/google-calendar-connections";
import { getGoogleCalendarConnectionRepository } from "../../../../src/calendar/repository";

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const error = formData.get("error");
  const code = formData.get("code");
  const state = formData.get("state");

  if (typeof error === "string" && error) {
    return Response.json({ error: "oauth_denied" }, { status: 400 });
  }

  if (typeof code !== "string" || typeof state !== "string") {
    return Response.json({ error: "invalid_oauth_callback" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !tokenEncryptionKey) {
    return Response.json(
      { error: "google_oauth_not_configured" },
      { status: 500 },
    );
  }

  const connection = await completeGoogleCalendarConnection({
    baseUrl: new URL(request.url).origin,
    clientId,
    clientSecret,
    code,
    fetchImpl: fetch,
    repository: getGoogleCalendarConnectionRepository(),
    sessionSecret: getSessionSecret(),
    state,
    tokenEncryptionKey,
  });

  return Response.json({
    connection: presentGoogleCalendarConnection(connection),
  });
}
