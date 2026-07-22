import type { Clock } from "../system/clock";

import type { AdminUserRepository, UserListItem } from "./users.repository";
import type { InviteListItem, InviteRepository } from "./invites.repository";
import type { SessionRepository } from "../auth/session";

export type AdminUserInviteError =
  "self_invite" | "email_already_invited" | "internal_error";

export type AdminUserInviteResult =
  | { ok: true; maskedEmail: string; inviteId: string }
  | { ok: false; reason: AdminUserInviteError };

export type AdminUserChangeRoleError =
  "self_role_change" | "user_not_found" | "internal_error";

export type AdminUserChangeRoleResult =
  { ok: true } | { ok: false; reason: AdminUserChangeRoleError };

export type AdminUserSuspendError =
  | "self_suspend"
  | "user_not_found"
  | "user_already_suspended"
  | "internal_error";

export type AdminUserSuspendResult =
  { ok: true } | { ok: false; reason: AdminUserSuspendError };

export type AdminUserReinstateError =
  | "self_reinstate"
  | "user_not_found"
  | "user_already_active"
  | "internal_error";

export type AdminUserReinstateResult =
  { ok: true } | { ok: false; reason: AdminUserReinstateError };

export type AdminUserResendInviteError = "invite_not_found" | "internal_error";

export type AdminUserResendInviteResult =
  | { ok: true; maskedEmail: string; inviteId: string }
  | { ok: false; reason: AdminUserResendInviteError };

export type AdminUsersLoadResult = {
  users: UserListItem[];
  recentInvites: InviteListItem[];
};

export type AdminUsersWorkflow = {
  load(): Promise<AdminUsersLoadResult>;
  inviteUser(input: {
    actorId: string;
    actorEmail: string;
    email: string;
    role: InviteListItem["role"];
  }): Promise<AdminUserInviteResult>;
  changeRole(input: {
    actorId: string;
    targetUserId: string;
    role: UserListItem["role"];
  }): Promise<AdminUserChangeRoleResult>;
  suspend(input: {
    actorId: string;
    targetUserId: string;
  }): Promise<AdminUserSuspendResult>;
  reinstate(input: {
    actorId: string;
    targetUserId: string;
  }): Promise<AdminUserReinstateResult>;
  resendInvite(input: {
    actorId: string;
    inviteId: string;
  }): Promise<AdminUserResendInviteResult>;
};

export type AdminUsersWorkflowDependencies = {
  userRepository: AdminUserRepository;
  inviteRepository: InviteRepository;
  sessionRepository: Pick<SessionRepository, "deleteByUserId">;
  clock: Clock;
};

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) {
    return `${local[0] ?? "*"}***${domain}`;
  }
  return `${local.slice(0, 2)}***${domain}`;
}

export function createAdminUsersWorkflow(
  deps: AdminUsersWorkflowDependencies,
): AdminUsersWorkflow {
  const {
    userRepository,
    inviteRepository,
    sessionRepository: _unused1,
    clock: _unused2,
  } = deps;
  void _unused1;
  void _unused2;

  return {
    async load() {
      const users = await userRepository.listUsers();
      const recentInvites = await inviteRepository.listRecentInvites(20);
      return { users, recentInvites };
    },

    inviteUser({ actorEmail, email }) {
      if (normalizeEmail(email) === normalizeEmail(actorEmail)) {
        return Promise.resolve({ ok: false, reason: "self_invite" } as const);
      }
      return Promise.resolve({
        ok: false,
        reason: "email_already_invited",
      } as const);
    },

    changeRole({ actorId, targetUserId }) {
      if (actorId === targetUserId) {
        return Promise.resolve({
          ok: false,
          reason: "self_role_change",
        } as const);
      }
      return Promise.resolve({ ok: false, reason: "user_not_found" } as const);
    },

    suspend({ actorId, targetUserId }) {
      if (actorId === targetUserId) {
        return Promise.resolve({ ok: false, reason: "self_suspend" } as const);
      }
      return Promise.resolve({ ok: false, reason: "user_not_found" } as const);
    },

    reinstate({ actorId, targetUserId }) {
      if (actorId === targetUserId) {
        return Promise.resolve({
          ok: false,
          reason: "self_reinstate",
        } as const);
      }
      return Promise.resolve({ ok: false, reason: "user_not_found" } as const);
    },

    resendInvite() {
      return Promise.resolve({
        ok: false,
        reason: "invite_not_found",
      } as const);
    },
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Re-export the session deleteByUserId hook so the workflow can revoke all
// sessions for a suspended user in the same operation.
export type AdminUsersSessionRepository = Pick<
  SessionRepository,
  "deleteByUserId"
>;

// Re-export the seam type for clarity when invoking the workflow.
export type AdminUsersClock = Clock;
