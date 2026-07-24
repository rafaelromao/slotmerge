import { err, ok, type Result } from "../lib/result";
import type { Clock } from "../system/clock";

import type {
  AdminUserRepository,
  UserListItem,
} from "../admin/users.repository";
import type {
  InviteListItemWithExpiry,
  InviteRecord,
  InviteRepository,
  InviteRole,
  InviteStatus,
  RefreshInviteResult,
} from "../admin/invites.repository";
import type { SessionRepository } from "../auth/session";
import type { MagicLinkTokenIssuer } from "../auth/magic-link";
import type { EmailDeliveryService } from "../email/service";

const inviteLifetimeDays = 30;

export type InviteEffectiveStatus = InviteStatus | "expired";

export type AdminUsersRecentInvite = InviteListItemWithExpiry & {
  effectiveStatus: InviteEffectiveStatus;
};

export type AdminUserInviteError =
  | "self_invite"
  | "email_already_invited"
  | "invalid_email"
  | "invalid_role"
  | "active_user"
  | "internal_error";

export type AdminUserInviteOk = {
  maskedEmail: string;
  inviteId: string;
};

export type AdminUserChangeRoleError =
  "self_role_change" | "user_not_found" | "invalid_role" | "internal_error";

export type AdminUserSuspendError =
  | "self_suspend"
  | "user_not_found"
  | "user_already_suspended"
  | "confirm_email_mismatch"
  | "confirm_email_required"
  | "user_not_eligible"
  | "internal_error";

export type AdminUserReinstateError =
  | "self_reinstate"
  | "user_not_found"
  | "user_already_active"
  | "internal_error";

export type AdminUserResendInviteError =
  "invite_not_found" | "user_already_active" | "internal_error";

export type AdminUserResendInviteOk = {
  maskedEmail: string;
  inviteId: string;
};

export type AdminUsersLoadOk = {
  users: UserListItem[];
  recentInvites: AdminUsersRecentInvite[];
};

export type AdminUsersWorkflow = {
  load(): Promise<Result<AdminUsersLoadOk, never>>;
  inviteUser(input: {
    actorId: string;
    actorEmail: string;
    email: string;
    role: InviteRole;
  }): Promise<Result<AdminUserInviteOk, AdminUserInviteError>>;
  changeRole(input: {
    actorId: string;
    targetUserId: string;
    role: UserListItem["role"];
  }): Promise<Result<void, AdminUserChangeRoleError>>;
  suspend(input: {
    actorId: string;
    targetUserId: string;
    confirmEmail: string | null;
  }): Promise<Result<void, AdminUserSuspendError>>;
  reinstate(input: {
    actorId: string;
    targetUserId: string;
  }): Promise<Result<void, AdminUserReinstateError>>;
  resendInvite(input: {
    actorId: string;
    inviteId: string;
  }): Promise<Result<AdminUserResendInviteOk, AdminUserResendInviteError>>;
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
  const normalized = normalizeEmail(email);
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

// Conservative server-side syntax check: require non-empty local-part,
// a single '@', a non-empty domain, a dot in the domain, and only
// characters that the magic-link verifier and the SMTP transport both
// accept. The same shape is what `<input type="email">` enforces in the
// browser, so this turns the server-side guard into a typed
// `invalid_email` Result branch instead of letting `not-an-email` slip
// through to `createInvite`.
const EMAIL_SYNTAX = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function isValidInviteeEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (!EMAIL_SYNTAX.test(email)) return false;
  const at = email.indexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (local.includes("..")) return false;
  return domain.includes(".");
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
    async load(): Promise<Result<AdminUsersLoadOk, never>> {
      const users = await userRepository.listUsers();
      const recentInvitesRaw = await inviteRepository.listRecentInvites(20);
      const now = clock.now();
      const recentInvites: AdminUsersRecentInvite[] = recentInvitesRaw.map(
        (invite) => ({
          ...invite,
          effectiveStatus: deriveInviteStatus(invite, now),
        }),
      );
      return ok({ users, recentInvites });
    },

    async inviteUser({
      actorId,
      actorEmail,
      email,
      role,
    }): Promise<Result<AdminUserInviteOk, AdminUserInviteError>> {
      const normalizedEmail = normalizeEmail(email);
      const normalizedActorEmail = normalizeEmail(actorEmail);

      if (!isValidInviteeEmail(normalizedEmail)) {
        return err("invalid_email");
      }

      if (normalizedEmail === normalizedActorEmail) {
        return err("self_invite");
      }

      const activeUser =
        await userRepository.findActiveUserByEmail(normalizedEmail);
      if (activeUser) {
        return err("email_already_invited");
      }

      const pendingInvite =
        await inviteRepository.findPendingInviteByEmail?.(normalizedEmail);
      if (pendingInvite) {
        return err("email_already_invited");
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
          return err("email_already_invited");
        }
        return err("internal_error");
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

      return ok({
        maskedEmail: maskEmail(normalizedEmail),
        inviteId: createResult.invite.id,
      });
    },

    async changeRole({
      actorId,
      targetUserId,
      role,
    }): Promise<Result<void, AdminUserChangeRoleError>> {
      if (actorId === targetUserId) {
        return err("self_role_change");
      }

      const result = await userRepository.changeRole({
        userId: targetUserId,
        actingAdminId: actorId,
        role,
        now: clock.now(),
      });

      if (!result.ok) {
        if (result.reason === "self") {
          return err("self_role_change");
        }
        return err("user_not_found");
      }

      return ok(undefined);
    },

    async suspend({
      actorId,
      targetUserId,
      confirmEmail,
    }): Promise<Result<void, AdminUserSuspendError>> {
      if (actorId === targetUserId) {
        return err("self_suspend");
      }

      const target = await userRepository.listUsers();
      const targetUser = target.find((u) => u.id === targetUserId);
      if (!targetUser) {
        return err("user_not_found");
      }

      if (targetUser.status !== "active") {
        return err("user_not_found");
      }

      const normalizedConfirm = normalizeEmail(confirmEmail ?? "");
      if (normalizedConfirm.length === 0) {
        return err("confirm_email_required");
      }

      if (normalizedConfirm !== targetUser.email) {
        return err("confirm_email_mismatch");
      }

      const result = await userRepository.suspend({
        userId: targetUserId,
        actingAdminId: actorId,
        now: clock.now(),
      });

      if (!result.ok) {
        switch (result.reason) {
          case "self":
            return err("self_suspend");
          case "already_suspended":
            return err("user_already_suspended");
          case "not_found":
          default:
            return err("user_not_found");
        }
      }

      await sessionRepository.deleteByUserId?.(targetUserId);
      return ok(undefined);
    },

    async reinstate({
      actorId,
      targetUserId,
    }): Promise<Result<void, AdminUserReinstateError>> {
      if (actorId === targetUserId) {
        return err("self_reinstate");
      }

      const result = await userRepository.reinstate({
        userId: targetUserId,
        actingAdminId: actorId,
        now: clock.now(),
      });

      if (!result.ok) {
        switch (result.reason) {
          case "self":
            return err("self_reinstate");
          case "already_active":
            return err("user_already_active");
          case "not_found":
          default:
            return err("user_not_found");
        }
      }

      return ok(undefined);
    },

    async resendInvite({
      actorId,
      inviteId,
    }): Promise<Result<AdminUserResendInviteOk, AdminUserResendInviteError>> {
      const original = await inviteRepository.findInviteById?.(inviteId);
      if (!original) {
        return err("invite_not_found");
      }

      const now = clock.now();
      const expiresAt = computeInviteExpiresAt(now);

      const refreshResult: RefreshInviteResult | null | undefined =
        await inviteRepository.refreshInvite?.({
          inviteId: original.id,
          now,
          expiresAt,
        });

      if (!refreshResult) {
        return err("internal_error");
      }

      if (!refreshResult.ok) {
        if (refreshResult.reason === "not_found") {
          return err("invite_not_found");
        }
        return err(refreshResult.reason);
      }

      const refreshed = refreshResult.invite;

      if (emailDeliveryService && magicLinkTokenIssuer) {
        const magicLink = magicLinkTokenIssuer.issueMagicLinkToken({
          inviteId: refreshed.id,
          email: refreshed.email,
          expiresAt: refreshed.expiresAt,
          generation: refreshed.magicLinkGeneration ?? 0,
        });

        await emailDeliveryService.sendEmail({
          recipient: refreshed.email,
          type: "invite",
          payload: {
            inviteId: refreshed.id,
            email: refreshed.email,
            role: refreshed.role,
            invitedByAdminId: actorId,
            magicLinkGeneration: refreshed.magicLinkGeneration ?? 0,
            magicLinkUrl: magicLink.magicLinkUrl,
            magicLinkToken: magicLink.token,
            expiresAt: magicLink.expiresAt.toISOString(),
            previousInviteId: original.id,
          },
        });
      }

      return ok({
        maskedEmail: maskEmail(refreshed.email),
        inviteId: refreshed.id,
      });
    },
  };
}
