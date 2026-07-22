import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../../../../src/auth/session";
import { createTopicProposalsHandlers } from "../../../../../../src/topics/proposals-route";

export async function POST(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const candidateName = formData.get("candidateName");
  const csrfToken = formData.get("csrfToken");

  if (typeof candidateName !== "string" || typeof csrfToken !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  if (
    csrfToken.length !== session.csrfToken.length ||
    !timingSafeEqual(Buffer.from(csrfToken), Buffer.from(session.csrfToken))
  ) {
    return Response.json({ error: "invalid_csrf_token" }, { status: 403 });
  }

  const jsonRequest = new Request(request.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ candidateName }),
  });

  const proposalsHandlers = createTopicProposalsHandlers();
  const result = await proposalsHandlers.POST(jsonRequest);

  return result;
}
