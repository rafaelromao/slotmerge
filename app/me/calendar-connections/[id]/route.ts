import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { createCalendarActionRequiredEmailTrigger } from "../../../../src/calendar/action-required-email-singleton";
import {
  presentCalendarConnection,
  revokeCalendarConnection,
} from "../../../../src/calendar/connection";
import { getCalendarProvider } from "../../../../src/calendar/providers";
import { getCalendarConnectionRepository } from "../../../../src/calendar/repository";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { createProviderFetchImpl } from "../../../../src/lib/fetch-wrapper";
import { systemClock } from "../../../../src/system/clock";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: expectedId } = await params;
  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncryptionKey) {
    return Response.json({ error: "oauth_not_configured" }, { status: 500 });
  }

  const repository = getCalendarConnectionRepository();
  const found = await repository.findById(expectedId);

  if (!found || found.userId !== session.user.id) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  type CalendarConnectionPatchBody = {
    contributingCalendarIds?: string[];
    disconnect?: boolean;
  } | null;

  const body = (await request
    .json()
    .catch(() => null)) as CalendarConnectionPatchBody;
  const wantsDisconnect = body?.disconnect === true || body == null;

  if (body?.contributingCalendarIds !== undefined) {
    const calendarIds = body.contributingCalendarIds;
    if (
      !Array.isArray(calendarIds) ||
      !calendarIds.every((id) => typeof id === "string")
    ) {
      return Response.json(
        { error: "invalid_contributing_calendar_ids" },
        { status: 400 },
      );
    }

    const updated = await repository.updateById(expectedId, {
      contributingCalendarIds: calendarIds,
    });
    if (!updated) {
      return Response.json(
        { error: "calendar_connection_not_found" },
        { status: 404 },
      );
    }
    return Response.json({
      connection: presentCalendarConnection({
        provider: getCalendarProvider(updated.provider),
        connection: updated,
      }),
    });
  }

  if (wantsDisconnect) {
    const isLocalOrTest =
      process.env.APP_ENV === "local" || process.env.APP_ENV === "test";
    const overrideUrl = process.env.LOCAL_PROVIDER_OVERRIDE_URL;
    const fetchImpl =
      isLocalOrTest && overrideUrl
        ? createProviderFetchImpl(fetch, overrideUrl)
        : fetch;

    const connection = await revokeCalendarConnection({
      provider: getCalendarProvider(found.provider),
      repository,
      connectionId: expectedId,
      fetchImpl,
      tokenEncryptionKey,
    });
    await safelyTriggerActionRequiredEmail({
      id: connection.id,
      userId: connection.userId,
      provider: connection.provider,
      user: {
        email: session.user.email,
        displayName: session.user.displayName,
      },
      occurredAt: systemClock().now(),
    });

    return Response.json({
      connection: presentCalendarConnection({
        provider: getCalendarProvider(connection.provider),
        connection,
      }),
    });
  }

  return Response.json({ error: "nothing_to_update" }, { status: 400 });
}

async function safelyTriggerActionRequiredEmail(args: {
  id: string;
  userId: string;
  provider: "google" | "microsoft";
  user: { email: string; displayName: string | null };
  occurredAt: Date;
}): Promise<void> {
  const trigger = createCalendarActionRequiredEmailTrigger({
    clock: { now: () => args.occurredAt },
  });
  try {
    await trigger({
      connection: {
        ...args,
        baseUrl: loadRuntimeConfig().appPublicUrl,
      },
      reason: "token-revoked",
    });
  } catch {
    return;
  }
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
