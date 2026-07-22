import {
  extractSessionIdFromRequest,
  getSessionFromRequest,
  getSessionSecret,
} from "../../../../src/auth/session";
import { getCalendarConnectionRepository } from "../../../../src/calendar/repository";
import type { CalendarProvider } from "../../../../src/db/schema";
import { assertCsrfOrThrow, CsrfError } from "../../../../src/lib/csrf";
import { systemClock } from "../../../../src/system/clock";
import { createCalendarConnectionWorkflow } from "../../../../src/workflow/calendar-connection";

export function createCalendarConnectPost(provider: CalendarProvider) {
  return async function POST(request: Request): Promise<Response> {
    const [session, sessionId] = await Promise.all([
      getSessionFromRequest(request),
      extractSessionIdFromRequest(request),
    ]);
    if (!session || !sessionId) {
      return Response.json({ error: "unauthenticated" }, { status: 401 });
    }

    try {
      await assertCsrfOrThrow(request, session);
    } catch (error) {
      if (error instanceof CsrfError) {
        return error.toResponse();
      }
      throw error;
    }

    const workflow = createCalendarConnectionWorkflow({
      repository: getCalendarConnectionRepository(),
      clock: systemClock(),
      listProviderCalendars: () => Promise.resolve([]),
      oauth: {
        baseUrl: new URL(request.url).origin,
        clientIds: {
          google: process.env.GOOGLE_OAUTH_CLIENT_ID,
          microsoft: process.env.MICROSOFT_OAUTH_CLIENT_ID,
        },
        csrfToken: session.csrfToken,
        sessionId,
        sessionSecret: getSessionSecret(),
      },
    });
    const result = await workflow.startOAuth({
      userId: session.user.id,
      provider,
    });

    if (!result.ok) {
      return Response.json({ error: "oauth_start_failed" }, { status: 503 });
    }

    return Response.redirect(result.value.authorizeUrl, 303);
  };
}
