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

    const formData = await request.formData();
    const connectionIdValue = formData.get("connectionId");
    const connectionId =
      typeof connectionIdValue === "string" && connectionIdValue.length > 0
        ? connectionIdValue
        : undefined;
    const workflow = createCalendarConnectionWorkflow({
      repository: getCalendarConnectionRepository(),
      clock: systemClock(),
      listProviderCalendars: () => Promise.resolve([]),
      oauth: {
        baseUrl: process.env.APP_PUBLIC_URL ?? new URL(request.url).origin,
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
      connectionId,
    });

    if (!result.ok) {
      return Response.json({ error: "oauth_start_failed" }, { status: 503 });
    }

    return Response.redirect(
      withMockScenario(result.value.authorizeUrl, request),
      303,
    );
  };
}

function withMockScenario(authorizeUrl: string, request: Request): string {
  const enabled =
    (process.env.APP_ENV === "local" || process.env.APP_ENV === "test") &&
    process.env.CALENDAR_PROVIDER_MODE === "mock" &&
    Boolean(process.env.LOCAL_PROVIDER_OVERRIDE_URL);
  if (!enabled) return authorizeUrl;
  const scenario = new URL(request.url).searchParams.get("scenario");
  if (
    !scenario ||
    !["connected", "denied", "expired", "personal"].includes(scenario)
  ) {
    return authorizeUrl;
  }
  const target = new URL(authorizeUrl);
  target.searchParams.set("scenario", scenario);
  return target.toString();
}
