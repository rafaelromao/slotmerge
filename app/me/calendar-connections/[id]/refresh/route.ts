import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../../../src/auth/session";
import { loadRuntimeConfig } from "../../../../../src/config/runtime";
import { findCalendarConnectionById } from "../../../../../src/calendar/repository";
import { enqueueSyncCalendarConnectionJob } from "../../../../../src/worker/sync";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const { id: connectionId } = await params;
  const connection = await findCalendarConnectionById(connectionId);

  if (!connection) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  if (connection.userId !== session.user.id) {
    return Response.json(
      { error: "calendar_connection_not_found" },
      { status: 404 },
    );
  }

  const config = loadRuntimeConfig();

  try {
    await enqueueSyncCalendarConnectionJob(connectionId, config.databaseUrl);
  } catch {
    return Response.json(
      { error: "failed_to_enqueue_sync_job" },
      { status: 500 },
    );
  }

  return new Response(null, { status: 202 });
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
