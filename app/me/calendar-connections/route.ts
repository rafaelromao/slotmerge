import { getSessionFromRequest } from "../../../src/auth/session";
import { presentGoogleCalendarConnection } from "../../../src/calendar/google-calendar-connections";
import { presentMicrosoftCalendarConnection } from "../../../src/calendar/microsoft-calendar-connections";
import {
  buildCalendarConnectionHealthFields,
} from "../../../src/calendar/calendar-connection-health";
import type { GoogleCalendarConnectionView } from "../../../src/calendar/google-calendar-connections";
import type { MicrosoftCalendarConnectionView } from "../../../src/calendar/microsoft-calendar-connections";
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

  const now = new Date();

  const connections: Array<
    GoogleCalendarConnectionView | MicrosoftCalendarConnectionView
  > = [
    ...googleConnections.map((conn) => {
      const view = presentGoogleCalendarConnection(conn);
      const health = buildCalendarConnectionHealthFields(conn, now);
      return { ...view, ...health };
    }),
    ...microsoftConnections.map((conn) => {
      const view = presentMicrosoftCalendarConnection(conn);
      const health = buildCalendarConnectionHealthFields(conn, now);
      return { ...view, ...health };
    }),
  ];

  return Response.json({ connections });
}
