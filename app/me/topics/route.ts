import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../src/auth/session";
import {
  getTopicPageState,
  saveUserTopicSelection,
} from "../../../src/topics/repository";
import { TopicsPageView } from "../../../src/topics/topics-page-view";
import { renderToStaticMarkup } from "react-dom/server";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { catalogue, selectedTopicIds } = await getTopicPageState(
    session.user.id,
  );

  return new Response(
    `<!doctype html><html lang="en"><body>${renderToStaticMarkup(
      TopicsPageView({
        catalogue,
        selectedTopicIds,
        csrfToken: session.csrfToken,
      }),
    )}</body></html>`,
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  return updateTopics(request);
}

export async function PUT(request: Request): Promise<Response> {
  return updateTopics(request);
}

async function updateTopics(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { topicIds, csrfToken } = await readMutationPayload(request);

  if (!hasValidCsrfToken(csrfToken, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf_token" }, { status: 403 });
  }

  await saveUserTopicSelection(session.user.id, topicIds);

  if (request.method === "PUT") {
    return Response.json({ ok: true });
  }

  return Response.redirect(new URL("/me/topics", request.url), 303);
}

async function readMutationPayload(request: Request): Promise<{
  topicIds: string[];
  csrfToken: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      topicIds?: unknown;
      csrfToken?: unknown;
    };

    return {
      topicIds: normalizeTopicIds(body.topicIds),
      csrfToken: getCsrfToken(body.csrfToken),
    };
  }

  const formData = await request.formData();

  return {
    topicIds: normalizeTopicIds(formData.getAll("topicIds")),
    csrfToken: getCsrfToken(formData.get("csrfToken")),
  };
}

function normalizeTopicIds(topicIds: unknown): string[] {
  if (!Array.isArray(topicIds)) {
    return [];
  }

  return topicIds.filter(
    (topicId): topicId is string => typeof topicId === "string",
  );
}

function getCsrfToken(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hasValidCsrfToken(
  actualToken: string,
  expectedToken: string,
): boolean {
  if (actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
