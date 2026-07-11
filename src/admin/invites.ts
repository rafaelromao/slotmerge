import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getSessionFromRequest, type Session } from "../auth/session";
import { getDb } from "../db/client";
import {
  invites,
  type InviteRole,
  type InviteStatus,
  users,
} from "../db/schema";

export type InviteListItem = {
  id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  invitedByAdminId: string;
  invitedByAdminEmail: string;
};

export type InviteRepository = {
  listInvites(): Promise<InviteListItem[]>;
  createInvite(input: {
    email: string;
    role: InviteRole;
    invitedByAdminId: string;
  }): Promise<CreateInviteResult>;
};

export type CreateInviteResult =
  { ok: true } | { ok: false; reason: "duplicate" };

export type AdminInvitesDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  inviteRepository?: InviteRepository;
};

const inviteSubmissionSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["user", "organizer", "admin"]).default("user"),
});

const inviteLifetimeDays = 30;

export function createAdminInvitesHandlers({
  getSession = getSessionFromRequest,
  inviteRepository = databaseInviteRepository,
}: AdminInvitesDependencies = {}) {
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return createAccessDeniedResponse(session);
      }

      const invites = await inviteRepository.listInvites();
      return htmlResponse(
        renderAdminInvitesPage({ invites, csrfToken: session.csrfToken }),
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
          renderAdminInvitesPage({
            invites: await inviteRepository.listInvites(),
            csrfToken: session.csrfToken,
            errorMessage: "Invalid CSRF token.",
          }),
          403,
        );
      }

      const submission = inviteSubmissionSchema.parse({
        email: formData.get("email"),
        role: formData.get("role") ?? undefined,
      });

      const result = await inviteRepository.createInvite({
        email: normalizeEmail(submission.email),
        role: submission.role,
        invitedByAdminId: session.user.id,
      });

      if (!result.ok) {
        return htmlResponse(
          renderAdminInvitesPage({
            invites: await inviteRepository.listInvites(),
            csrfToken: session.csrfToken,
            errorMessage: "An invite already exists for that email.",
          }),
          409,
        );
      }

      return Response.redirect(new URL("/admin/invites", request.url), 303);
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

function renderAdminInvitesPage({
  invites,
  csrfToken,
  errorMessage,
}: {
  invites: InviteListItem[];
  csrfToken: string;
  errorMessage?: string;
}): string {
  const rows =
    invites.length > 0
      ? invites
          .map(
            (invite) => `
              <tr>
                <td>${escapeHtml(invite.email)}</td>
                <td>${escapeHtml(labelInviteRole(invite.role))}</td>
                <td>${escapeHtml(labelInviteStatus(invite.status))}</td>
                <td>${escapeHtml(invite.invitedByAdminEmail)}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="4">No invites yet.</td></tr>`;

  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Invite users</h1>
      ${errorMessage ? `<p role="alert">${escapeHtml(errorMessage)}</p>` : ""}
      <form method="post">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Role
          <select name="role">
            <option value="user" selected>User</option>
            <option value="organizer">Organizer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit">Invite user</button>
      </form>
      <section>
        <h2>Invites</h2>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Invited by</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

function labelInviteRole(role: InviteRole): string {
  return role === "user"
    ? "User"
    : role === "organizer"
      ? "Organizer"
      : "Admin";
}

function labelInviteStatus(status: InviteStatus): string {
  return status === "pending"
    ? "Pending"
    : status === "accepted"
      ? "Accepted"
      : "Revoked";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getDefaultInviteExpiration(): Date {
  return new Date(Date.now() + inviteLifetimeDays * 24 * 60 * 60 * 1000);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const databaseInviteRepository: InviteRepository = {
  listInvites: async () => {
    const rows = await getDb()
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        status: invites.status,
        invitedByAdminId: invites.invitedByAdminId,
        invitedByAdminEmail: users.email,
      })
      .from(invites)
      .innerJoin(users, eq(invites.invitedByAdminId, users.id))
      .orderBy(desc(invites.createdAt));

    return rows;
  },
  createInvite: async ({ email, role, invitedByAdminId }) => {
    try {
      await getDb()
        .insert(invites)
        .values({
          email,
          role,
          status: "pending",
          invitedByAdminId,
          expiresAt: getDefaultInviteExpiration(),
        })
        .returning({ id: invites.id });

      return { ok: true };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: false, reason: "duplicate" };
      }
      throw error;
    }
  },
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
