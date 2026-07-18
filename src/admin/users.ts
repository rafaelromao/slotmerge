import { getSessionFromRequest, type Session } from "../auth/session";
import type { UserRole, UserStatus } from "../db/schema";
import { z } from "zod";
import {
  adminAccessDeniedResponse,
  escapeHtml,
  htmlResponse,
  isAdminSession,
  renderAdminShell,
} from "./page";
import {
  createPostgresAdminUserRepository,
  type AdminUserRepository,
  type UserListItem,
} from "./users.repository";

export type {
  ChangeRoleResult,
  ReinstateResult,
  SuspendResult,
  UserListItem,
} from "./users.repository";
export type { AdminUserRepository } from "./users.repository";

export type AdminUsersDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  userRepository?: AdminUserRepository;
  clock?: () => Date;
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

let cachedUserRepository: AdminUserRepository | null = null;

function getUserRepository(): AdminUserRepository {
  if (!cachedUserRepository) {
    cachedUserRepository = createPostgresAdminUserRepository();
  }
  return cachedUserRepository;
}

export function createAdminUsersHandlers({
  getSession = getSessionFromRequest,
  userRepository,
  clock = () => new Date(),
}: AdminUsersDependencies = {}) {
  const resolveRepository = () => userRepository ?? getUserRepository();
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
      }

      const users = await resolveRepository().listUsers();
      return htmlResponse(
        renderAdminShell({
          title: "Users",
          body: renderAdminUsersBody({
            userRows: users,
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
        return createPostErrorResponse(
          resolveRepository(),
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
          resolveRepository(),
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
            resolveRepository(),
            session,
            "Enter a valid role.",
            400,
          );
        }

        const repository = resolveRepository();
        const result = await repository.changeRole({
          userId: submission.data.userId,
          actingAdminId: session.user.id,
          role: submission.data.role,
          now: clock(),
        });
        if (!result.ok) {
          const message =
            result.reason === "self"
              ? "Admins cannot change their own role."
              : "User not found.";
          return createPostErrorResponse(repository, session, message, 409);
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
            resolveRepository(),
            session,
            "Missing user ID.",
            400,
          );
        }

        const repository = resolveRepository();
        const result = await repository.suspend({
          userId: submission.data.userId,
          actingAdminId: session.user.id,
          now: clock(),
        });
        if (!result.ok) {
          const message = suspendErrorMessage(result.reason);
          return createPostErrorResponse(repository, session, message, 409);
        }
        return Response.redirect(new URL("/admin/users", request.url), 303);
      }

      const submission = reinstateSubmissionSchema.safeParse({
        action,
        userId: formData.get("userId"),
      });
      if (!submission.success) {
        return createPostErrorResponse(
          resolveRepository(),
          session,
          "Missing user ID.",
          400,
        );
      }

      const repository = resolveRepository();
      const result = await repository.reinstate({
        userId: submission.data.userId,
        actingAdminId: session.user.id,
        now: clock(),
      });
      if (!result.ok) {
        const message = reinstateErrorMessage(result.reason);
        return createPostErrorResponse(repository, session, message, 409);
      }
      return Response.redirect(new URL("/admin/users", request.url), 303);
    },
  };
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
    renderAdminShell({
      title: "Users",
      body: renderAdminUsersBody({
        userRows,
        csrfToken: session.csrfToken,
      }),
      alert: { message },
    }),
    status,
  );
}

function renderAdminUsersBody({
  userRows,
  csrfToken,
}: {
  userRows: UserListItem[];
  csrfToken: string;
}): string {
  const rows =
    userRows.length > 0
      ? userRows.map((u) => renderUserRow(u, csrfToken)).join("")
      : `<tr><td colspan="5">No users yet.</td></tr>`;

  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
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
    </table>`;
}

function renderUserRow(u: UserListItem, csrfToken: string): string {
  return `
    <tr>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.displayName ?? "—")}</td>
      <td>${escapeHtml(labelUserRole(u.role))}</td>
      <td>${escapeHtml(labelUserStatus(u.status))}</td>
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

function labelUserRole(role: UserRole): string {
  return role === "user"
    ? "User"
    : role === "organizer"
      ? "Organizer"
      : "Admin";
}

function labelUserStatus(status: UserStatus): string {
  return status === "active" ? "Active" : "Suspended";
}
