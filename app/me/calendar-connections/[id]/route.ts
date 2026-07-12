import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { createCalendarActionRequiredEmailTrigger } from "../../../../src/calendar/action-required-email-singleton";
import {
  presentGoogleCalendarConnection,
  revokeGoogleCalendarConnection,
} from "../../../../src/calendar/google-calendar-connections";
import {
  presentMicrosoftCalendarConnection,
  revokeMicrosoftCalendarConnection,
} from "../../../../src/calendar/microsoft-calendar-connections";
import {
  findCalendarConnectionById,
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "../../../../src/calendar/repository";
import { loadRuntimeConfig } from "../../../../src/config/runtime";

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

  type CalendarConnectionPatchBody = {
    contributingCalendarIds?: string[];
    disconnect?: boolean;
  } | null;

  const body = (await request
    .json()
    .catch(() => null)) as CalendarConnectionPatchBody;
  const wantsDisconnect = body?.disconnect === true;

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

    if (found.provider === "google") {
      const repository = getGoogleCalendarConnectionRepository();
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
        connection: presentGoogleCalendarConnection(updated),
      });
    }

    const repository = getMicrosoftCalendarConnectionRepository();
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
      connection: presentMicrosoftCalendarConnection(updated),
    });
  }

  if (wantsDisconnect || body === null) {
    if (found.provider === "microsoft") {
      const connection = await revokeMicrosoftCalendarConnection({
        connectionId: expectedId,
        fetchImpl: fetch,
        repository: getMicrosoftCalendarConnectionRepository(),
        tokenEncryptionKey,
      });
      await safelyTriggerActionRequiredEmail({
        id: connection.id,
        userId: connection.userId,
        provider: "microsoft",
        user: {
          email: session.user.email,
          displayName: session.user.displayName,
        },
        occurredAt: new Date(),
      });
      return Response.json({
        connection: presentMicrosoftCalendarConnection(connection),
      });
    }

    const connection = await revokeGoogleCalendarConnection({
      connectionId: expectedId,
      fetchImpl: fetch,
      repository: getGoogleCalendarConnectionRepository(),
      tokenEncryptionKey,
    });
    await safelyTriggerActionRequiredEmail({
      id: connection.id,
      userId: connection.userId,
      provider: "google",
      user: {
        email: session.user.email,
        displayName: session.user.displayName,
      },
      occurredAt: new Date(),
    });

    return Response.json({
      connection: presentGoogleCalendarConnection(connection),
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
    clock: () => args.occurredAt,
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
    // Email enqueue failures are surfaced through the email_events log; the
    // HTTP revoke response should still succeed.
  }
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
