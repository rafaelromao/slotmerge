import {
  clearSessionCookie,
  extractSessionIdFromRequest,
  getSessionRepository,
} from "../../../src/auth/session";

export async function DELETE(request: Request): Promise<Response> {
  const sessionId = await extractSessionIdFromRequest(request);

  if (sessionId) {
    await getSessionRepository().delete?.(sessionId);
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