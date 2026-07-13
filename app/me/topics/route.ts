import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../src/auth/session";
import {
  getTopicPageState,
  saveUserTopicSelection,
} from "../../../src/topics/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { catalogue, selectedTopicIds } = await getTopicPageState(
    session.user.id,
  );

  return htmlResponse(
    renderTopicsPage({
      catalogue,
      selectedTopicIds,
      csrfToken: session.csrfToken,
    }),
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

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

type CatalogueEntry = { id: string; name: string };

function renderTopicsPage({
  catalogue,
  selectedTopicIds,
  csrfToken,
}: {
  catalogue: CatalogueEntry[];
  selectedTopicIds: string[];
  csrfToken: string;
}): string {
  const rows = catalogue
    .map(
      (topic) => `
      <li>
        <label>
          <input type="checkbox" name="topicIds" value="${escapeHtml(topic.id)}" ${selectedTopicIds.includes(topic.id) ? 'checked=""' : ""} />
          <span>${escapeHtml(topic.name)}</span>
        </label>
      </li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <body>
    <main style="margin:0 auto;max-width:42rem;padding:2rem 1.25rem;font-family:system-ui,sans-serif;">
      <header style="margin-bottom:1.5rem;">
        <h1 style="margin:0;font-size:2rem;">My Topics</h1>
        <p style="margin:0.5rem 0 0;color:#4b5563;">Browse the active Topic catalogue and choose which Topics belong on your profile.</p>
      </header>
      <form action="/me/topics" method="post" style="border-top:1px solid #e5e7eb;padding-top:1rem;">
        <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}" />
        <h2 id="active-topics" style="margin:0 0 0.75rem;font-size:1.125rem;">Active Topics</h2>
        <ul style="margin:0;padding-left:1.25rem;">${rows}</ul>
        <button type="submit" style="margin-top:1rem;padding:0.625rem 1rem;">Save topics</button>
      </form>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
