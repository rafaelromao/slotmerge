import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getSessionFromRequest, type Session } from "../auth/session";
import { getDb } from "../db/client";
import {
  topicProposals,
  topics,
  users,
  type TopicProposalStatus,
} from "../db/schema";

export type TopicProposalListItem = {
  id: string;
  candidateName: string;
  status: TopicProposalStatus;
  proposedByUserId: string;
  proposedByUserEmail: string;
  createdAt: Date;
};

export type ApproveResult =
  { ok: true; topicId: string } | { ok: false; reason: "already_processed" };

export type RejectResult =
  { ok: true } | { ok: false; reason: "already_processed" };

export type TopicProposalRepository = {
  listPending(): Promise<TopicProposalListItem[]>;
  approve(id: string): Promise<ApproveResult>;
  reject(id: string): Promise<RejectResult>;
};

export type AdminTopicProposalsDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  topicProposalRepository?: TopicProposalRepository;
};

const actionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  _csrf: z.string(),
});

export function createAdminTopicProposalsHandlers({
  getSession = getSessionFromRequest,
  topicProposalRepository = databaseTopicProposalRepository,
}: AdminTopicProposalsDependencies = {}) {
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return createAccessDeniedResponse(session);
      }

      const proposals = await topicProposalRepository.listPending();
      return htmlResponse(
        renderTopicProposalsPage({
          proposalRows: proposals,
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
          renderTopicProposalsPage({
            proposalRows: await topicProposalRepository.listPending(),
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
          renderTopicProposalsPage({
            proposalRows: await topicProposalRepository.listPending(),
            csrfToken: session.csrfToken,
            errorMessage: "Invalid action.",
          }),
          400,
        );
      }

      const id = formData.get("id");
      if (typeof id !== "string") {
        return htmlResponse(
          renderTopicProposalsPage({
            proposalRows: await topicProposalRepository.listPending(),
            csrfToken: session.csrfToken,
            errorMessage: "Missing proposal ID.",
          }),
          400,
        );
      }

      if (actionResult.data.action === "approve") {
        const result = await topicProposalRepository.approve(id);
        if (!result.ok) {
          return htmlResponse(
            renderTopicProposalsPage({
              proposalRows: await topicProposalRepository.listPending(),
              csrfToken: session.csrfToken,
              errorMessage:
                result.reason === "already_processed"
                  ? "This proposal has already been processed."
                  : "Failed to approve proposal.",
            }),
            409,
          );
        }
      } else {
        const result = await topicProposalRepository.reject(id);
        if (!result.ok) {
          return htmlResponse(
            renderTopicProposalsPage({
              proposalRows: await topicProposalRepository.listPending(),
              csrfToken: session.csrfToken,
              errorMessage:
                result.reason === "already_processed"
                  ? "This proposal has already been processed."
                  : "Failed to reject proposal.",
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

function isAdminSession(session: Session | null): session is Session {
  return session?.user.role === "admin";
}

function createAccessDeniedResponse(session: Session | null): Response {
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

function renderTopicProposalsPage({
  proposalRows,
  csrfToken,
  errorMessage,
}: {
  proposalRows: TopicProposalListItem[];
  csrfToken: string;
  errorMessage?: string;
}): string {
  const rows =
    proposalRows.length > 0
      ? proposalRows
          .map(
            (p) => `
              <tr>
                <td>${escapeHtml(p.candidateName)}</td>
                <td>${escapeHtml(p.proposedByUserEmail)}</td>
                <td>${escapeHtml(labelStatus(p.status))}</td>
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

  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Topic Proposals</h1>
      ${errorMessage ? `<p role="alert">${escapeHtml(errorMessage)}</p>` : ""}
      <section>
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
      </section>
    </main>
  </body>
</html>`;
}

function labelStatus(status: TopicProposalStatus): string {
  return status === "pending"
    ? "Pending"
    : status === "approved"
      ? "Approved"
      : "Rejected";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const databaseTopicProposalRepository: TopicProposalRepository = {
  listPending: async () => {
    const rows = await getDb()
      .select({
        id: topicProposals.id,
        candidateName: topicProposals.candidateName,
        status: topicProposals.status,
        proposedByUserId: topicProposals.proposedByUserId,
        proposedByUserEmail: users.email,
        createdAt: topicProposals.createdAt,
      })
      .from(topicProposals)
      .innerJoin(users, eq(topicProposals.proposedByUserId, users.id))
      .where(eq(topicProposals.status, "pending"))
      .orderBy(desc(topicProposals.createdAt));

    return rows;
  },

  approve: async (id: string) => {
    const db = getDb();

    const [proposal] = await db
      .select()
      .from(topicProposals)
      .where(eq(topicProposals.id, id))
      .limit(1);

    if (!proposal || proposal.status !== "pending") {
      return { ok: false, reason: "already_processed" };
    }

    const result = await db.transaction(async (tx) => {
      const [topic] = await tx
        .insert(topics)
        .values({
          name: proposal.candidateName,
          status: "active",
        })
        .returning({ id: topics.id });

      await tx
        .update(topicProposals)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(topicProposals.id, id));

      return { topicId: topic.id };
    });

    return { ok: true, topicId: result.topicId };
  },

  reject: async (id: string) => {
    const db = getDb();

    const [proposal] = await db
      .select()
      .from(topicProposals)
      .where(eq(topicProposals.id, id))
      .limit(1);

    if (!proposal || proposal.status !== "pending") {
      return { ok: false, reason: "already_processed" };
    }

    await db
      .update(topicProposals)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(topicProposals.id, id));

    return { ok: true };
  },
};
