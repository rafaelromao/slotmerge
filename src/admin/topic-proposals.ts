import { z } from "zod";

import { getSessionFromRequest, type Session } from "../auth/session";
import type { TopicProposalStatus } from "../db/schema";
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
  createPostgresTopicProposalRepository,
  type TopicProposalAdminRepository,
  type TopicProposalListItem,
} from "../topics/proposals.repository";

export type {
  ApproveResult,
  RejectResult,
} from "../topics/proposals.repository";

export type AdminTopicProposalsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  topicProposalRepository?: TopicProposalAdminRepository;
  clock?: Clock;
};

const systemClockBoundary = systemClock();

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  _csrf: z.string(),
});

let cachedTopicProposalRepository: TopicProposalAdminRepository | null = null;

function getTopicProposalRepository(): TopicProposalAdminRepository {
  if (!cachedTopicProposalRepository) {
    cachedTopicProposalRepository = createPostgresTopicProposalRepository();
  }
  return cachedTopicProposalRepository;
}

export function createAdminTopicProposalsHandlers({
  getSession = getSessionFromRequest,
  topicProposalRepository,
  clock = systemClockBoundary,
}: AdminTopicProposalsDependencies = {}) {
  const resolveRepository = () =>
    topicProposalRepository ?? getTopicProposalRepository();
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
      }

      const proposals = await resolveRepository().listPending();
      return htmlResponse(
        renderAdminShell({
          title: "Topic Proposals",
          body: renderTopicProposalsBody({
            proposalRows: proposals,
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
            title: "Topic Proposals",
            body: renderTopicProposalsBody({
              proposalRows: await resolveRepository().listPending(),
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
            title: "Topic Proposals",
            body: renderTopicProposalsBody({
              proposalRows: await resolveRepository().listPending(),
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
            title: "Topic Proposals",
            body: renderTopicProposalsBody({
              proposalRows: await resolveRepository().listPending(),
              csrfToken: session.csrfToken,
            }),
            alert: { message: "Missing proposal ID." },
          }),
          400,
        );
      }

      const now = clock.now();
      const repository = resolveRepository();

      if (actionResult.data.action === "approve") {
        const result = await repository.approve({ id, now });
        if (!result.ok) {
          return htmlResponse(
            renderAdminShell({
              title: "Topic Proposals",
              body: renderTopicProposalsBody({
                proposalRows: await repository.listPending(),
                csrfToken: session.csrfToken,
              }),
              alert: {
                message:
                  result.reason === "already_processed"
                    ? "This proposal has already been processed."
                    : "Failed to approve proposal.",
              },
            }),
            409,
          );
        }
      } else {
        const result = await repository.reject({ id, now });
        if (!result.ok) {
          return htmlResponse(
            renderAdminShell({
              title: "Topic Proposals",
              body: renderTopicProposalsBody({
                proposalRows: await repository.listPending(),
                csrfToken: session.csrfToken,
              }),
              alert: {
                message:
                  result.reason === "already_processed"
                    ? "This proposal has already been processed."
                    : "Failed to reject proposal.",
              },
            }),
            409,
          );
        }
      }

      return Response.redirect(
        new URL("/admin/topic-proposals", request.url),
        303,
      );
    },
  };
}

function renderTopicProposalsBody({
  proposalRows,
  csrfToken,
}: {
  proposalRows: TopicProposalListItem[];
  csrfToken: string;
}): string {
  const rows =
    proposalRows.length > 0
      ? proposalRows
          .map(
            (p) => `
              <tr>
                <td>${escapeHtml(p.candidateName)}</td>
                <td>${escapeHtml(p.proposedByUserEmail ?? "(deleted User)")}</td>
                <td>${escapeHtml(labelProposalStatus(p.status))}</td>
                <td>
                  <form method="post" style="display:inline">
                    <input type="hidden" name="id" value="${escapeHtml(p.id)}" />
                    <input type="hidden" name="action" value="approve" />
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <button type="submit">Approve</button>
                  </form>
                  <form method="post" style="display:inline">
                    <input type="hidden" name="id" value="${escapeHtml(p.id)}" />
                    <input type="hidden" name="action" value="reject" />
                    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                    <button type="submit">Reject</button>
                  </form>
                </td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="4">No pending proposals.</td></tr>`;

  return `<section>
    <h2>Pending Proposals</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Proposed by</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function labelProposalStatus(status: TopicProposalStatus): string {
  return status === "pending"
    ? "Pending"
    : status === "approved"
      ? "Approved"
      : "Rejected";
}
