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

  return new Response(
    renderTopicsPageDocument(catalogue, selectedTopicIds, session.csrfToken),
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

  if (csrfToken !== session.csrfToken) {
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

function renderTopicsPageDocument(
  catalogue: Array<{ id: string; name: string }>,
  selectedTopicIds: string[],
  csrfToken: string,
): string {
  return `<!doctype html><html lang="en"><body><main style="margin:0 auto;max-width:42rem;padding:2rem 1.25rem;line-height:1.5;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><header style="margin-bottom:1.5rem"><h1 style="margin:0;font-size:2rem">My Topics</h1><p style="margin:0.5rem 0 0;color:#4b5563">Browse the active Topic catalogue and choose which Topics belong on your profile.</p></header><form action="/me/topics" method="post" style="border-top:1px solid #e5e7eb;padding-top:1rem"><input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}" /><h2 id="active-topics" style="margin:0 0 0.75rem;font-size:1.125rem">Active Topics</h2><ul style="margin:0;padding-left:1.25rem">${catalogue
    .map((topic) =>
      renderTopicListItem(topic, selectedTopicIds.includes(topic.id)),
    )
    .join(
      "",
    )}</ul><button style="margin-top:1rem;padding:0.625rem 1rem" type="submit">Save topics</button></form></main></body></html>`;
}

function renderTopicListItem(
  topic: { id: string; name: string },
  selected: boolean,
): string {
  return `<li style="margin-bottom:0.5rem"><label style="display:flex;align-items:center;gap:0.75rem"><input type="checkbox" name="topicIds" value="${escapeHtml(topic.id)}"${
    selected ? ' checked=""' : ""
  }/><span>${escapeHtml(topic.name)}</span></label></li>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
