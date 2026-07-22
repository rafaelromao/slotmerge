import type { Clock } from "../system/clock";

import type { AdminUserRepository, UserListItem } from "./users.repository";
import type {
  InviteListItemWithExpiry,
  InviteRecord,
  InviteRepository,
  InviteRole,
  InviteStatus,
} from "./invites.repository";
import type { SessionRepository } from "../auth/session";
import type { MagicLinkTokenIssuer } from "../auth/magic-link";
import type { EmailDeliveryService } from "../email/service";

const inviteLifetimeDays = 30;

export type InviteEffectiveStatus = InviteStatus | "expired";

export type AdminUsersRecentInvite = InviteListItemWithExpiry & {
  effectiveStatus: InviteEffectiveStatus;
};

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
  recentInvites: AdminUsersRecentInvite[];
};

export type AdminUsersWorkflow = {
  load(): Promise<AdminUsersLoadResult>;
  inviteUser(input: {
    actorId: string;
    actorEmail: string;
    email: string;
    role: InviteRole;
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
  emailDeliveryService?: EmailDeliveryService;
  magicLinkTokenIssuer?: MagicLinkTokenIssuer;
  clock: Clock;
};

export function maskEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at);
  if (local.length <= 2) {
    return `${local[0] ?? "*"}***${domain}`;
  }
  return `${local.slice(0, 2)}***${domain}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function computeInviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + inviteLifetimeDays * 24 * 60 * 60 * 1000);
}

export function deriveInviteStatus(
  invite: InviteListItemWithExpiry,
  now: Date,
): InviteEffectiveStatus {
  if (invite.status !== "pending") {
    return invite.status;
  }
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "pending";
}

export function createAdminUsersWorkflow(
  deps: AdminUsersWorkflowDependencies,
): AdminUsersWorkflow {
  const {
    userRepository,
    inviteRepository,
    sessionRepository,
    emailDeliveryService,
    magicLinkTokenIssuer,
    clock,
  } = deps;

  return {
    async load() {
      const users = await userRepository.listUsers();
      const recentInvitesRaw = await inviteRepository.listRecentInvites(20);
      const now = clock.now();
      const recentInvites: AdminUsersRecentInvite[] = recentInvitesRaw.map(
        (invite) => ({
          ...invite,
          effectiveStatus: deriveInviteStatus(invite, now),
        }),
      );
      return { users, recentInvites };
    },

    async inviteUser({ actorId, actorEmail, email, role }) {
      const normalizedEmail = normalizeEmail(email);
      const normalizedActorEmail = normalizeEmail(actorEmail);

      if (normalizedEmail === normalizedActorEmail) {
        return { ok: false, reason: "self_invite" } as const;
      }

      const [activeUser, pendingInvite] = await Promise.all([
        userRepository.findActiveUserByEmail(normalizedEmail),
        inviteRepository.findPendingInviteByEmail?.(normalizedEmail),
      ]);

      if (activeUser || pendingInvite) {
        return { ok: false, reason: "email_already_invited" } as const;
      }

      const now = clock.now();
      const expiresAt = computeInviteExpiresAt(now);

      const createResult = await inviteRepository.createInvite({
        email: normalizedEmail,
        role,
        invitedByAdminId: actorId,
        now,
        expiresAt,
      });

      if (!createResult.ok) {
        if (createResult.reason === "duplicate") {
          return { ok: false, reason: "email_already_invited" } as const;
        }
        return { ok: false, reason: "internal_error" } as const;
      }

      if (emailDeliveryService && magicLinkTokenIssuer) {
        const invite: InviteRecord = createResult.invite;
        const magicLink = magicLinkTokenIssuer.issueMagicLinkToken({
          inviteId: invite.id,
          email: invite.email,
          expiresAt: invite.expiresAt,
          generation: invite.magicLinkGeneration ?? 0,
        });

        await emailDeliveryService.sendEmail({
          recipient: invite.email,
          type: "invite",
          payload: {
            inviteId: invite.id,
            email: invite.email,
            role: invite.role,
            invitedByAdminId: invite.invitedByAdminId,
            magicLinkGeneration: invite.magicLinkGeneration ?? 0,
            magicLinkUrl: magicLink.magicLinkUrl,
            magicLinkToken: magicLink.token,
            expiresAt: magicLink.expiresAt.toISOString(),
          },
        });
      }

      return {
        ok: true,
        maskedEmail: maskEmail(normalizedEmail),
        inviteId: createResult.invite.id,
      } as const;
    },

    async changeRole({ actorId, targetUserId, role }) {
      if (actorId === targetUserId) {
        return { ok: false, reason: "self_role_change" } as const;
      }

      const result = await userRepository.changeRole({
        userId: targetUserId,
        actingAdminId: actorId,
        role,
        now: clock.now(),
      });

      if (!result.ok) {
        if (result.reason === "self") {
          return { ok: false, reason: "self_role_change" } as const;
        }
        return { ok: false, reason: "user_not_found" } as const;
      }

      return { ok: true } as const;
    },

    async suspend({ actorId, targetUserId }) {
      if (actorId === targetUserId) {
        return { ok: false, reason: "self_suspend" } as const;
      }

      const result = await userRepository.suspend({
        userId: targetUserId,
        actingAdminId: actorId,
        now: clock.now(),
      });

      if (!result.ok) {
        switch (result.reason) {
          case "self":
            return { ok: false, reason: "self_suspend" } as const;
          case "already_suspended":
            return {
              ok: false,
              reason: "user_already_suspended",
            } as const;
          case "not_found":
          default:
            return { ok: false, reason: "user_not_found" } as const;
        }
      }

      await sessionRepository.deleteByUserId?.(targetUserId);
      return { ok: true } as const;
    },

    async reinstate({ actorId, targetUserId }) {
      if (actorId === targetUserId) {
        return { ok: false, reason: "self_reinstate" } as const;
      }

      const result = await userRepository.reinstate({
        userId: targetUserId,
        actingAdminId: actorId,
        now: clock.now(),
      });

      if (!result.ok) {
        switch (result.reason) {
          case "self":
            return { ok: false, reason: "self_reinstate" } as const;
          case "already_active":
            return { ok: false, reason: "user_already_active" } as const;
          case "not_found":
          default:
            return { ok: false, reason: "user_not_found" } as const;
        }
      }

      return { ok: true } as const;
    },

    async resendInvite({ actorId, inviteId }) {
      const original = await inviteRepository.findInviteById?.(inviteId);
      if (!original) {
        return { ok: false, reason: "invite_not_found" } as const;
      }

      const now = clock.now();
      await inviteRepository.revokeInvite?.(original.id, now);
      const expiresAt = computeInviteExpiresAt(now);
      const createResult = await inviteRepository.createInvite({
        email: original.email,
        role: original.role,
        invitedByAdminId: actorId,
        now,
        expiresAt,
      });

      if (!createResult.ok) {
        return { ok: false, reason: "internal_error" } as const;
      }

      if (emailDeliveryService && magicLinkTokenIssuer) {
        const invite: InviteRecord = createResult.invite;
        const magicLink = magicLinkTokenIssuer.issueMagicLinkToken({
          inviteId: invite.id,
          email: invite.email,
          expiresAt: invite.expiresAt,
          generation: invite.magicLinkGeneration ?? 0,
        });

        await emailDeliveryService.sendEmail({
          recipient: invite.email,
          type: "invite",
          payload: {
            inviteId: invite.id,
            email: invite.email,
            role: invite.role,
            invitedByAdminId: invite.invitedByAdminId,
            magicLinkGeneration: invite.magicLinkGeneration ?? 0,
            magicLinkUrl: magicLink.magicLinkUrl,
            magicLinkToken: magicLink.token,
            expiresAt: magicLink.expiresAt.toISOString(),
            previousInviteId: original.id,
          },
        });
      }

      return {
        ok: true,
        maskedEmail: maskEmail(original.email),
        inviteId: createResult.invite.id,
      } as const;
    },
  };
}

// Re-export the session deleteByUserId hook so the workflow can revoke all
// sessions for a suspended user in the same operation.
export type AdminUsersSessionRepository = Pick<
  SessionRepository,
  "deleteByUserId"
>;

// Re-export the seam type for clarity when invoking the workflow.
export type AdminUsersClock = Clock;
