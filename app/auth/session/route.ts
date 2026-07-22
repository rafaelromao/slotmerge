import { timingSafeEqual } from "node:crypto";

import {
  clearSessionCookie,
  extractSessionIdFromRequest,
  getSessionFromRequest,
  getSessionRepository,
} from "../../../src/auth/session";

type SessionRouteMode = "DELETE" | "POST";

async function handleSignOut(
  request: Request,
  mode: SessionRouteMode,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  const redirectHeaders = {
    Location: `${origin}/`,
    "Set-Cookie": clearSessionCookie(),
  };

  if (mode === "POST") {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return new Response(null, {
        status: 302,
        headers: redirectHeaders,
      });
    }

    const csrfToken = await extractCsrfToken(request);
    if (!csrfToken || !csrfMatches(csrfToken, session.csrfToken)) {
      return new Response("Invalid CSRF token", { status: 403 });
    }
  }

  const sessionId = await extractSessionIdFromRequest(request);
  if (sessionId) {
    await getSessionRepository().delete?.(sessionId);
  }

  return new Response(null, {
    status: 302,
    headers: redirectHeaders,
  });
}

async function extractCsrfToken(request: Request): Promise<string | null> {
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken) {
    return headerToken;
  }

  try {
    const cloned = request.clone();
    const formData = await cloned.formData();
    const value = formData.get("_csrf");
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function csrfMatches(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function POST(request: Request): Promise<Response> {
  return handleSignOut(request, "POST");
}

export function DELETE(request: Request): Promise<Response> {
  return handleSignOut(request, "DELETE");
}
