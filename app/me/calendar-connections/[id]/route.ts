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
    user: { email: session.user.email, displayName: session.user.displayName },
    occurredAt: new Date(),
  });

  return Response.json({
    connection: presentGoogleCalendarConnection(connection),
  });
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
        baseUrl: extractBaseUrl(),
      },
      reason: "token-revoked",
    });
  } catch {
    // Email enqueue failures are surfaced through the email_events log; the
    // HTTP revoke response should still succeed.
  }
}

function extractBaseUrl(): string {
  const explicit = process.env.APP_PUBLIC_URL;
  if (explicit) {
    return explicit;
  }
  return "http://localhost";
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
