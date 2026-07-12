import { getSessionFromRequest } from "../../../src/auth/session";
import { presentGoogleCalendarConnection } from "../../../src/calendar/google-calendar-connections";
import { getGoogleCalendarConnectionRepository } from "../../../src/calendar/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const connections =
    await getGoogleCalendarConnectionRepository().listByUserId(session.user.id);

  return Response.json({
    connections: connections.map(presentGoogleCalendarConnection),
  });
}
