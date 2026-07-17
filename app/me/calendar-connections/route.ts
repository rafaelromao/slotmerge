import { getSessionFromRequest } from "../../../src/auth/session";
import {
  presentCalendarConnection,
  type CalendarConnectionRecord,
} from "../../../src/calendar/connection";
import { buildCalendarConnectionHealthFields } from "../../../src/calendar/calendar-connection-health";
import { getCalendarConnectionRepository } from "../../../src/calendar/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const connections = await getCalendarConnectionRepository().listByUserId(
    session.user.id,
  );

  const now = new Date();

  const views = connections.map((conn: CalendarConnectionRecord) => {
    const view = presentCalendarConnection(conn);
    const health = buildCalendarConnectionHealthFields(conn, now);
    return { ...view, ...health };
  });

  return Response.json({ connections: views });
}
