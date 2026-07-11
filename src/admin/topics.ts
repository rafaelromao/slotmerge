import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getSessionFromRequest, type Session } from "../auth/session";
import { getDb } from "../db/client";
import { topics, type TopicStatus } from "../db/schema";

export type TopicListItem = {
  id: string;
  name: string;
  status: TopicStatus;
  retiredAt: Date | null;
  createdAt: Date;
};

export type RetireResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_retired" };

export type TopicRepository = {
  listActive(): Promise<TopicListItem[]>;
  retire(id: string): Promise<RetireResult>;
};

export type AdminTopicsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  topicRepository?: TopicRepository;
};

const actionSchema = z.object({
  action: z.literal("retire"),
  _csrf: z.string(),
});

export function createAdminTopicsHandlers({
  getSession = getSessionFromRequest,
  topicRepository = databaseTopicRepository,
}: AdminTopicsDependencies = {}) {
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return createAccessDeniedResponse(session);
      }

      const topicsList = await topicRepository.listActive();
      return htmlResponse(
        renderTopicsPage({
          topicRows: topicsList,
          csrfToken: session.csrfToken,
        }),
      );
    },

    POST: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return createAccessDeniedResponse(session);
      }

      const formData = await request.formData();
      const csrfToken = formData.get("_csrf");
      if (typeof csrfToken !== "string" || csrfToken !== session.csrfToken) {
        return htmlResponse(
          renderTopicsPage({
            topicRows: await topicRepository.listActive(),
            csrfToken: session.csrfToken,
            errorMessage: "Invalid CSRF token.",
          }),
          403,
        );
      }

      const actionResult = actionSchema.safeParse({
        action: formData.get("action"),
        _csrf: csrfToken,
      });

      if (!actionResult.success) {
        return htmlResponse(
          renderTopicsPage({
            topicRows: await topicRepository.listActive(),
            csrfToken: session.csrfToken,
            errorMessage: "Invalid action.",
          }),
          400,
        );
      }

      const id = formData.get("id");
      if (typeof id !== "string") {
        return htmlResponse(
          renderTopicsPage({
            topicRows: await topicRepository.listActive(),
            csrfToken: session.csrfToken,
            errorMessage: "Missing topic ID.",
          }),
          400,
        );
      }

      const result = await topicRepository.retire(id);
      if (!result.ok) {
        return htmlResponse(
          renderTopicsPage({
            topicRows: await topicRepository.listActive(),
            csrfToken: session.csrfToken,
            errorMessage:
              result.reason === "not_found"
                ? "Topic not found."
                : result.reason === "already_retired"
                  ? "This topic is already retired."
                  : "Failed to retire topic.",
          }),
          409,
        );
      }

      return Response.redirect(new URL("/admin/topics", request.url), 303);
    },
  };
}

function isAdminSession(session: Session | null): session is Session {
  return session?.user.role === "admin";
}

function createAccessDeniedResponse(
  session: Session | null,
): Response {
  return htmlResponse(
    session
      ? "<h1>Forbidden</h1><p>Admin access required.</p>"
      : "<h1>Unauthorized</h1><p>Sign in required.</p>",
    session ? 403 : 401,
  );
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderTopicsPage({
  topicRows,
  csrfToken,
  errorMessage,
}: {
  topicRows: TopicListItem[];
  csrfToken: string;
  errorMessage?: string;
}): string {
  const rows =
    topicRows.length > 0
      ? topicRows
          .map(
            (t) => `
              <tr>
                <td>${escapeHtml(t.name)}</td>
                <td>${escapeHtml(labelStatus(t.status))}</td>
                <td>${t.retiredAt ? escapeHtml(formatDate(t.retiredAt)) : "—"}</td>
                <td>
                  ${t.status === "active" ? `
                  <form method="post" style="display:inline">
                    <input type="hidden" name="id" value="${escapeHtml(t.id)}" />
                    <input type="hidden" name="action" value="retire" />
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <button type="submit">Retire</button>
                  </form>` : ""}
                </td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="4">No active topics.</td></tr>`;

  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Topics</h1>
      ${errorMessage ? `<p role="alert">${escapeHtml(errorMessage)}</p>` : ""}
      <section>
        <h2>Active Topics</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Retired At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

function labelStatus(status: TopicStatus): string {
  return status === "active"
    ? "Active"
    : status === "pending"
      ? "Pending"
      : "Retired";
}

function formatDate(date: Date): string {
  return date.toISOString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const databaseTopicRepository: TopicRepository = {
  listActive: async () => {
    const rows = await getDb()
      .select({
        id: topics.id,
        name: topics.name,
        status: topics.status,
        retiredAt: topics.retiredAt,
        createdAt: topics.createdAt,
      })
      .from(topics)
      .where(eq(topics.status, "active"))
      .orderBy(desc(topics.createdAt));

    return rows;
  },

  retire: async (id: string) => {
    const db = getDb();

    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, id))
      .limit(1);

    if (!topic) {
      return { ok: false, reason: "not_found" };
    }

    if (topic.status === "retired") {
      return { ok: false, reason: "already_retired" };
    }

    await db
      .update(topics)
      .set({ status: "retired", retiredAt: new Date(), updatedAt: new Date() })
      .where(eq(topics.id, id));

    return { ok: true };
  },
};
