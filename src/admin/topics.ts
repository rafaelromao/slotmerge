import { z } from "zod";

import { getSessionFromRequest, type Session } from "../auth/session";
import type { TopicStatus } from "../db/schema";
import type { Clock } from "../system/clock";
import { systemClock } from "../system/clock";
import {
  adminAccessDeniedResponse,
  escapeHtml,
  htmlResponse,
  isAdminSession,
  renderAdminShell,
} from "./page";
import {
  getTopicAdminRepository,
  setTopicCatalogueRepositoryForTests,
  type AdminTopicListItem,
  type TopicAdminRepository,
} from "../topics/repository";

export type { RetireResult } from "../topics/repository";

export type AdminTopicsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  topicRepository?: TopicAdminRepository;
  clock?: Clock;
};

const systemClockBoundary = systemClock();

const actionSchema = z.object({
  action: z.literal("retire"),
  _csrf: z.string(),
});

export function createAdminTopicsHandlers({
  getSession = getSessionFromRequest,
  topicRepository,
  clock = systemClockBoundary,
}: AdminTopicsDependencies = {}) {
  const resolveRepository = () => topicRepository ?? getTopicAdminRepository();
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
      }

      const topicsList = await resolveRepository().listActiveAdminTopics();
      return htmlResponse(
        renderAdminShell({
          title: "Topics",
          body: renderTopicsBody({
            topicRows: topicsList,
            csrfToken: session.csrfToken,
          }),
        }),
      );
    },

    POST: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
      }

      const formData = await request.formData();
      const csrfToken = formData.get("_csrf");
      if (typeof csrfToken !== "string" || csrfToken !== session.csrfToken) {
        return htmlResponse(
          renderAdminShell({
            title: "Topics",
            body: renderTopicsBody({
              topicRows: await resolveRepository().listActiveAdminTopics(),
              csrfToken: session.csrfToken,
            }),
            alert: { message: "Invalid CSRF token." },
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
          renderAdminShell({
            title: "Topics",
            body: renderTopicsBody({
              topicRows: await resolveRepository().listActiveAdminTopics(),
              csrfToken: session.csrfToken,
            }),
            alert: { message: "Invalid action." },
          }),
          400,
        );
      }

      const id = formData.get("id");
      if (typeof id !== "string") {
        return htmlResponse(
          renderAdminShell({
            title: "Topics",
            body: renderTopicsBody({
              topicRows: await resolveRepository().listActiveAdminTopics(),
              csrfToken: session.csrfToken,
            }),
            alert: { message: "Missing topic ID." },
          }),
          400,
        );
      }

      const repository = resolveRepository();
      const result = await repository.retire({ id, now: clock.now() });
      if (!result.ok) {
        return htmlResponse(
          renderAdminShell({
            title: "Topics",
            body: renderTopicsBody({
              topicRows: await repository.listActiveAdminTopics(),
              csrfToken: session.csrfToken,
            }),
            alert: {
              message:
                result.reason === "not_found"
                  ? "Topic not found."
                  : result.reason === "already_retired"
                    ? "This topic is already retired."
                    : "Failed to retire topic.",
            },
          }),
          409,
        );
      }

      return Response.redirect(new URL("/admin/topics", request.url), 303);
    },
  };
}

export { setTopicCatalogueRepositoryForTests };

function renderTopicsBody({
  topicRows,
  csrfToken,
}: {
  topicRows: AdminTopicListItem[];
  csrfToken: string;
}): string {
  const rows =
    topicRows.length > 0
      ? topicRows
          .map(
            (t) => `
              <tr>
                <td>${escapeHtml(t.name)}</td>
                <td>${escapeHtml(labelTopicStatus(t.status))}</td>
                <td>${t.retiredAt ? escapeHtml(formatDate(t.retiredAt)) : "—"}</td>
                <td>
                  ${
                    t.status === "active"
                      ? `
                  <form method="post" style="display:inline">
                    <input type="hidden" name="id" value="${escapeHtml(t.id)}" />
                    <input type="hidden" name="action" value="retire" />
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <button type="submit">Retire</button>
                  </form>`
                      : ""
                  }
                </td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="4">No active topics.</td></tr>`;

  return `<section>
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
  </section>`;
}

function labelTopicStatus(status: TopicStatus): string {
  return status === "active"
    ? "Active"
    : status === "pending"
      ? "Pending"
      : "Retired";
}

function formatDate(date: Date): string {
  return date.toISOString();
}
