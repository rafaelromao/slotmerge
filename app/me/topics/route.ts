import { timingSafeEqual } from "node:crypto";

import { getSessionFromRequest } from "../../../src/auth/session";
import {
  getTopicPageState,
  saveUserTopicSelection,
} from "../../../src/topics/repository";
import { createMeTopicProposalsHandlers } from "../../../src/topics/me-topic-proposals-route";
import { createTopicProposalsHandlers } from "../../../src/topics/proposals-route";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { catalogue, selectedTopicIds } = await getTopicPageState(
    session.user.id,
  );

  const meProposalsHandlers = createMeTopicProposalsHandlers();
  const proposalsResponse = await meProposalsHandlers.GET(request);
  const proposalsData = (await proposalsResponse.json()) as {
    proposals: {
      id: string;
      candidateName: string;
      status: string;
      createdAt: string;
    }[];
  };

  const url = new URL(request.url);
  const errorParam = url.searchParams.get("error");
  const proposalError = errorParam ? decodeURIComponent(errorParam) : null;

  return htmlResponse(
    renderTopicsPage({
      catalogue,
      selectedTopicIds,
      csrfToken: session.csrfToken,
      proposals: proposalsData.proposals,
      proposalError,
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  return updateTopics(request, () => new Date());
}

export async function PUT(request: Request): Promise<Response> {
  return updateTopics(request, () => new Date());
}

async function updateTopics(
  request: Request,
  clock: () => Date,
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { topicIds, csrfToken } = await readMutationPayload(request);

  if (!hasValidCsrfToken(csrfToken, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf_token" }, { status: 403 });
  }

  await saveUserTopicSelection({
    userId: session.user.id,
    topicIds,
    now: clock(),
  });

  if (request.method === "PUT") {
    return Response.json({ ok: true });
  }

  return Response.redirect(new URL("/me/topics", request.url), 303);
}

export async function submitTopicProposal(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.redirect(
      new URL("/me/topics?error=unauthenticated", request.url),
      303,
    );
  }

  const formData = await request.formData();
  const candidateName = formData.get("candidateName");
  const csrfToken = formData.get("csrfToken");

  if (typeof candidateName !== "string" || typeof csrfToken !== "string") {
    return Response.redirect(
      new URL("/me/topics?error=invalid_request", request.url),
      303,
    );
  }

  if (!hasValidCsrfToken(csrfToken, session.csrfToken)) {
    return Response.redirect(
      new URL("/me/topics?error=csrf", request.url),
      303,
    );
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

  if (result.status === 201) {
    return Response.redirect(new URL("/me/topics", request.url), 303);
  }

  const body = (await result.json()) as {
    error: string;
    matches?: { name: string; type: string }[];
  };

  const errorParam =
    body.error === "too_similar"
      ? encodeURIComponent(
          `too_similar:${(body.matches ?? []).map((m) => m.name).join(",")}`,
        )
      : encodeURIComponent(body.error);

  return Response.redirect(
    new URL(`/me/topics?error=${errorParam}`, request.url),
    303,
  );
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

type ProposalEntry = {
  id: string;
  candidateName: string;
  status: string;
  createdAt: string;
};

function renderTopicsPage({
  catalogue,
  selectedTopicIds,
  csrfToken,
  proposals,
  proposalError,
}: {
  catalogue: CatalogueEntry[];
  selectedTopicIds: string[];
  csrfToken: string;
  proposals: ProposalEntry[];
  proposalError: string | null;
}): string {
  const topicRows = catalogue
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

  const proposalRows =
    proposals.length > 0
      ? proposals
          .map(
            (p) => `
          <li>
            <span>${escapeHtml(p.candidateName)}</span>
            <span style="margin-left:0.5rem;color:#6b7280;">(${escapeHtml(p.status)})</span>
          </li>`,
          )
          .join("")
      : `<li><span style="color:#6b7280;">No pending proposals.</span></li>`;

  const errorBanner = proposalError
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:0.75rem;border-radius:0.375rem;margin-bottom:1rem;">
           ${
             proposalError.startsWith("too_similar:")
               ? `Too similar to existing: ${escapeHtml(proposalError.replace("too_similar:", ""))}`
               : escapeHtml(proposalError.replace(/_/g, " "))
           }
         </div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <body>
    <main style="margin:0 auto;max-width:42rem;padding:2rem 1.25rem;font-family:system-ui,sans-serif;">
      <header style="margin-bottom:1.5rem;">
        <h1 style="margin:0;font-size:2rem;">My Topics</h1>
        <p style="margin:0.5rem 0 0;color:#4b5563;">Browse the active Topic catalogue and choose which Topics belong on your profile.</p>
      </header>
      <section style="border-top:1px solid #e5e7eb;padding-top:1rem;">
        <h2 id="active-topics" style="margin:0 0 0.75rem;font-size:1.125rem;">Active Topics</h2>
        <form action="/me/topics" method="post">
          <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}" />
          <ul style="margin:0;padding-left:1.25rem;">${topicRows}</ul>
          <button type="submit" style="margin-top:1rem;padding:0.625rem 1rem;">Save topics</button>
        </form>
      </section>
      <section style="border-top:1px solid #e5e7eb;padding-top:1rem;margin-top:1.5rem;">
        <h2 id="propose-topic" style="margin:0 0 0.75rem;font-size:1.125rem;">Propose a new Topic</h2>
        ${errorBanner}
        <form action="/me/topics/propose" method="post">
          <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}" />
          <div style="display:flex;gap:0.5rem;align-items:flex-start;">
            <input type="text" name="candidateName" placeholder="Topic name" required style="flex:1;padding:0.625rem;border:1px solid #d1d5db;border-radius:0.375rem;" />
            <button type="submit" style="padding:0.625rem 1rem;">Submit proposal</button>
          </div>
          <p style="margin:0.5rem 0 0;color:#6b7280;font-size:0.875rem;">Proposals are reviewed by admins. Similar names will be blocked to avoid catalogue fragmentation.</p>
        </form>
      </section>
      <section style="border-top:1px solid #e5e7eb;padding-top:1rem;margin-top:1.5rem;">
        <h2 id="my-proposals" style="margin:0 0 0.75rem;font-size:1.125rem;">My Proposals</h2>
        <ul style="margin:0;padding-left:1.25rem;">${proposalRows}</ul>
      </section>
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
