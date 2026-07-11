import { getSessionFromRequest } from "../../src/auth/session";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  return Response.json({
    user: session.user,
    session: { csrfToken: session.csrfToken },
    setup: { complete: false },
    discoverability: { consented: false },
    topics: [],
    topicProposals: [],
    availabilityWindows: [],
    calendarConnections: [],
  });
}
