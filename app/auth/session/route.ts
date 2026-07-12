import * as Iron from "@hapi/iron";
import { eq } from "drizzle-orm";

import { getDb } from "../../../src/db/client";
import { sessions } from "../../../src/db/schema";
import {
  clearSessionCookie,
  getSessionSecret,
} from "../../../src/auth/session";

let sessionDeleteOverride: ((id: string) => Promise<void>) | null = null;

export function setSessionDeleteForTests(
  fn: ((id: string) => Promise<void>) | null,
) {
  sessionDeleteOverride = fn;
}

export async function DELETE(request: Request): Promise<Response> {
  const sessionId = await extractSessionId(request);

  if (sessionId) {
    const deleteFn = sessionDeleteOverride ?? defaultDeleteSession;
    await deleteFn(sessionId);
  }

  const origin = new URL(request.url).origin;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/`,
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

async function extractSessionId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const sessionCookieName = "slotmerge_session";

  let sessionToken: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === sessionCookieName) {
      sessionToken = valueParts.join("=");
      break;
    }
  }

  if (!sessionToken) {
    return null;
  }

  try {
    const payload = (await Iron.unseal(
      decodeURIComponent(sessionToken),
      getSessionSecret(),
      Iron.defaults,
    )) as { sessionId: string };

    return payload.sessionId;
  } catch {
    return null;
  }
}

async function defaultDeleteSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
