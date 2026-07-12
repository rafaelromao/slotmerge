import { getSessionFromRequest } from "../../../src/auth/session";
import { presentGoogleCalendarConnection } from "../../../src/calendar/google-calendar-connections";
import { presentMicrosoftCalendarConnection } from "../../../src/calendar/microsoft-calendar-connections";
import {
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "../../../src/calendar/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const googleConnections =
    await getGoogleCalendarConnectionRepository().listByUserId(session.user.id);
  const microsoftConnections =
    await getMicrosoftCalendarConnectionRepository().listByUserId(
      session.user.id,
    );

  return Response.json({
    connections: [
      ...googleConnections.map(presentGoogleCalendarConnection),
      ...microsoftConnections.map(presentMicrosoftCalendarConnection),
    ],
  });
}
