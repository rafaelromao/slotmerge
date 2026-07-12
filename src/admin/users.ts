import { getSessionFromRequest, type Session } from "../auth/session";
import { getDb } from "../db/client";
import { users, type UserRole, type UserStatus } from "../db/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

export type UserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
};

export type ChangeRoleResult =
  { ok: true } | { ok: false; reason: "not_found" | "self" };

export type SuspendResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_suspended" | "self" };

export type ReinstateResult =
  { ok: true } | { ok: false; reason: "not_found" | "already_active" | "self" };

export type AdminUserRepository = {
  listUsers(): Promise<UserListItem[]>;
  changeRole(input: {
    userId: string;
    actingAdminId: string;
    role: UserRole;
  }): Promise<ChangeRoleResult>;
  suspend(input: {
    userId: string;
    actingAdminId: string;
  }): Promise<SuspendResult>;
  reinstate(input: {
    userId: string;
    actingAdminId: string;
  }): Promise<ReinstateResult>;
};

export type AdminUsersDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  userRepository?: AdminUserRepository;
};

const userActionSchema = z.object({
  action: z.enum(["change-role", "suspend", "reinstate"]),
  _csrf: z.string(),
});

const changeRoleSubmissionSchema = z.object({
  action: z.literal("change-role"),
  userId: z.string().min(1),
  role: z.enum(["user", "organizer", "admin"]),
});

const suspendSubmissionSchema = z.object({
  action: z.literal("suspend"),
  userId: z.string().min(1),
});

const reinstateSubmissionSchema = z.object({
  action: z.literal("reinstate"),
  userId: z.string().min(1),
});

export function createAdminUsersHandlers({
  getSession = getSessionFromRequest,
  userRepository = databaseAdminUserRepository,
}: AdminUsersDependencies = {}) {
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return createAccessDeniedResponse(session);
      }

      const users = await userRepository.listUsers();
      return htmlResponse(
        renderAdminUsersPage({
          userRows: users,
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
        return createPostErrorResponse(
          userRepository,
          session,
          "Invalid CSRF token.",
          403,
        );
      }

      const actionResult = userActionSchema.safeParse({
        action: formData.get("action"),
        _csrf: csrfToken,
      });
      if (!actionResult.success) {
        return createPostErrorResponse(
          userRepository,
          session,
          "Invalid action.",
          400,
        );
      }

      const action = actionResult.data.action;

      if (action === "change-role") {
        const submission = changeRoleSubmissionSchema.safeParse({
          action,
          userId: formData.get("userId"),
          role: formData.get("role"),
        });
        if (!submission.success) {
          return createPostErrorResponse(
            userRepository,
            session,
            "Enter a valid role.",
            400,
          );
        }

        const result = await userRepository.changeRole({
          userId: submission.data.userId,
          actingAdminId: session.user.id,
          role: submission.data.role,
        });
        if (!result.ok) {
          const message =
            result.reason === "self"
              ? "Admins cannot change their own role."
              : "User not found.";
          return createPostErrorResponse(userRepository, session, message, 409);
        }
        return Response.redirect(new URL("/admin/users", request.url), 303);
      }

      if (action === "suspend") {
        const submission = suspendSubmissionSchema.safeParse({
          action,
          userId: formData.get("userId"),
        });
        if (!submission.success) {
          return createPostErrorResponse(
            userRepository,
            session,
            "Missing user ID.",
            400,
          );
        }

        const result = await userRepository.suspend({
          userId: submission.data.userId,
          actingAdminId: session.user.id,
        });
        if (!result.ok) {
          const message = suspendErrorMessage(result.reason);
          return createPostErrorResponse(userRepository, session, message, 409);
        }
        return Response.redirect(new URL("/admin/users", request.url), 303);
      }

      const submission = reinstateSubmissionSchema.safeParse({
        action,
        userId: formData.get("userId"),
      });
      if (!submission.success) {
        return createPostErrorResponse(
          userRepository,
          session,
          "Missing user ID.",
          400,
        );
      }

      const result = await userRepository.reinstate({
        userId: submission.data.userId,
        actingAdminId: session.user.id,
      });
      if (!result.ok) {
        const message = reinstateErrorMessage(result.reason);
        return createPostErrorResponse(userRepository, session, message, 409);
      }
      return Response.redirect(new URL("/admin/users", request.url), 303);
    },
  };
}

function isAdminSession(session: Session | null): session is Session {
  return session?.user.role === "admin";
}

function suspendErrorMessage(
  reason: "not_found" | "already_suspended" | "self",
): string {
  if (reason === "not_found") {
    return "User not found.";
  }
  if (reason === "already_suspended") {
    return "This user is already suspended.";
  }
  return "Admins cannot suspend themselves.";
}

function reinstateErrorMessage(
  reason: "not_found" | "already_active" | "self",
): string {
  if (reason === "not_found") {
    return "User not found.";
  }
  if (reason === "already_active") {
    return "This user is already active.";
  }
  return "Admins cannot reinstate themselves.";
}

async function createPostErrorResponse(
  userRepository: AdminUserRepository,
  session: Session,
  message: string,
  status: number,
): Promise<Response> {
  let userRows: UserListItem[] = [];
  try {
    const result = await userRepository.listUsers();
    userRows = Array.isArray(result) ? result : [];
  } catch {
    userRows = [];
  }
  return htmlResponse(
    renderAdminUsersPage({
      userRows,
      csrfToken: session.csrfToken,
      errorMessage: message,
    }),
    status,
  );
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

function renderAdminUsersPage({
  userRows,
  csrfToken,
  errorMessage,
}: {
  userRows: UserListItem[];
  csrfToken: string;
  errorMessage?: string;
}): string {
  const rows =
    userRows.length > 0
      ? userRows.map((u) => renderUserRow(u, csrfToken)).join("")
      : `<tr><td colspan="5">No users yet.</td></tr>`;

  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Users</h1>
      ${errorMessage ? `<p role="alert">${escapeHtml(errorMessage)}</p>` : ""}
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Display name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </main>
  </body>
</html>`;
}

function renderUserRow(u: UserListItem, csrfToken: string): string {
  return `
    <tr>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.displayName ?? "—")}</td>
      <td>${escapeHtml(labelRole(u.role))}</td>
      <td>${escapeHtml(labelStatus(u.status))}</td>
      <td>
        <form method="post" style="display:inline">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <input type="hidden" name="action" value="change-role" />
          <input type="hidden" name="userId" value="${escapeHtml(u.id)}" />
          <select name="role">
            <option value="user" ${u.role === "user" ? "selected" : ""}>User</option>
            <option value="organizer" ${u.role === "organizer" ? "selected" : ""}>Organizer</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
          </select>
          <button type="submit">Update role</button>
        </form>
        ${
          u.status === "active"
            ? `<form method="post" style="display:inline">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                <input type="hidden" name="action" value="suspend" />
                <input type="hidden" name="userId" value="${escapeHtml(u.id)}" />
                <button type="submit">Suspend</button>
              </form>`
            : `<form method="post" style="display:inline">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
                <input type="hidden" name="action" value="reinstate" />
                <input type="hidden" name="userId" value="${escapeHtml(u.id)}" />
                <button type="submit">Reinstate</button>
              </form>`
        }
      </td>
    </tr>`;
}

function labelRole(role: UserRole): string {
  return role === "user"
    ? "User"
    : role === "organizer"
      ? "Organizer"
      : "Admin";
}

function labelStatus(status: UserStatus): string {
  return status === "active" ? "Active" : "Suspended";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const databaseAdminUserRepository: AdminUserRepository = {
  listUsers: async () => {
    const rows = await getDb()
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .orderBy(asc(users.createdAt));

    return rows;
  },

  changeRole: async ({ userId, actingAdminId, role }) => {
    if (userId === actingAdminId) {
      return { ok: false, reason: "self" };
    }

    const updated = await getDb()
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (updated.length === 0) {
      return { ok: false, reason: "not_found" };
    }

    return { ok: true };
  },

  suspend: async ({ userId, actingAdminId }) => {
    if (userId === actingAdminId) {
      return { ok: false, reason: "self" };
    }

    const db = getDb();

    const updated = await db
      .update(users)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .returning({ id: users.id });

    if (updated.length === 0) {
      const exists = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return exists.length === 0
        ? { ok: false, reason: "not_found" }
        : { ok: false, reason: "already_suspended" };
    }

    return { ok: true };
  },

  reinstate: async ({ userId, actingAdminId }) => {
    if (userId === actingAdminId) {
      return { ok: false, reason: "self" };
    }

    const db = getDb();

    const updated = await db
      .update(users)
      .set({ status: "active", updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.status, "suspended")))
      .returning({ id: users.id });

    if (updated.length === 0) {
      const exists = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return exists.length === 0
        ? { ok: false, reason: "not_found" }
        : { ok: false, reason: "already_active" };
    }

    return { ok: true };
  },
};
