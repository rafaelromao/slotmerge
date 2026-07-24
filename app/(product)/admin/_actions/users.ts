"use server";

import { redirect } from "next/navigation";

import { getServerSession } from "../../../../src/auth/session";
import { assertCsrfFromFormData, CsrfError } from "../../../../src/lib/csrf";
import {
  createAdminUsersWorkflow,
  type AdminUserChangeRoleError,
  type AdminUserInviteError,
  type AdminUserReinstateError,
  type AdminUserResendInviteError,
  type AdminUserSuspendError,
} from "../../../../src/workflow/admin-users";
import { createPostgresAdminUserRepository } from "../../../../src/admin/users.repository";
import { createPostgresInviteRepository } from "../../../../src/admin/invites.repository";
import { getSessionRepository } from "../../../../src/auth/session";
import { systemClock } from "../../../../src/system/clock";
import { createPostgresEmailEventRepository } from "../../../../src/email/repository";
import { createEmailDeliveryService } from "../../../../src/email/service";
import { enqueueInviteEmailJob } from "../../../../src/email/invite-jobs";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { createMagicLinkTokenIssuer } from "../../../../src/auth/magic-link";
import type { UserRole } from "../../../../src/db/schema";

function buildAdminWorkflow() {
  const config = loadRuntimeConfig();
  return createAdminUsersWorkflow({
    userRepository: createPostgresAdminUserRepository(),
    inviteRepository: createPostgresInviteRepository(),
    sessionRepository: getSessionRepository(),
    emailDeliveryService: createEmailDeliveryService({
      clock: systemClock(),
      eventRepository: createPostgresEmailEventRepository(),
      queueJob: (job) => enqueueInviteEmailJob(job),
    }),
    magicLinkTokenIssuer: createMagicLinkTokenIssuer({
      baseUrl: config.appBaseUrl,
      secret: config.magicLinkSecret,
      clock: systemClock(),
    }),
    clock: systemClock(),
  });
}

type SessionLike = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;

function csrfRedirect(): never {
  redirect("/admin?csrf=failed");
}

function assertCsrfForAction(formData: FormData, session: SessionLike): void {
  // The CSRF helper throws CsrfError on mismatch. The Server Action path
  // does NOT want a 403 — instead it surfaces the failure via the
  // /admin?csrf=failed query-string banner so the per-section banner is
  // shown instead of the segment-level error boundary.
  try {
    assertCsrfFromFormData(formData, session);
  } catch (error) {
    if (error instanceof CsrfError) {
      csrfRedirect();
    }
    throw error;
  }
}

async function assertAdminAndCsrf(formData: FormData): Promise<{
  session: SessionLike;
}> {
  const session = await getServerSession();
  if (!session || session.user.role !== "admin") {
    redirect("/sign-in?returnTo=%2Fadmin");
  }
  assertCsrfForAction(formData, session);
  return { session };
}

export async function inviteUserAction(formData: FormData): Promise<void> {
  const { session } = await assertAdminAndCsrf(formData);

  const email = readEmail(formData);
  const role = readRole(formData);
  if (!email || !role) {
    redirect("/admin?error=invalid_invite");
  }

  const workflow = buildAdminWorkflow();

  const result = await workflow.inviteUser({
    actorId: session.user.id,
    actorEmail: session.user.email,
    email,
    role,
  });

  redirect(redirectTargetForInvite(result));
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const { session } = await assertAdminAndCsrf(formData);

  const targetUserId = readUserId(formData);
  const role = readRole(formData);
  if (!targetUserId || !role) {
    redirect("/admin?error=invalid_role_change");
  }

  const workflow = buildAdminWorkflow();

  const result = await workflow.changeRole({
    actorId: session.user.id,
    targetUserId,
    role,
  });

  redirect(redirectTargetForChangeRole(result));
}

export async function suspendAction(formData: FormData): Promise<void> {
  const { session } = await assertAdminAndCsrf(formData);

  const targetUserId = readUserId(formData);
  const confirmEmail = readConfirmEmail(formData);
  if (!targetUserId) {
    redirect("/admin?error=invalid_suspend");
  }

  const workflow = buildAdminWorkflow();

  const result = await workflow.suspend({
    actorId: session.user.id,
    targetUserId,
    confirmEmail,
  });

  redirect(redirectTargetForSuspend(result));
}

export async function reinstateAction(formData: FormData): Promise<void> {
  const { session } = await assertAdminAndCsrf(formData);

  const targetUserId = readUserId(formData);
  if (!targetUserId) {
    redirect("/admin?error=invalid_reinstate");
  }

  const workflow = buildAdminWorkflow();

  const result = await workflow.reinstate({
    actorId: session.user.id,
    targetUserId,
  });

  redirect(redirectTargetForReinstate(result));
}

export async function resendInviteAction(formData: FormData): Promise<void> {
  const { session } = await assertAdminAndCsrf(formData);

  const inviteId = readInviteId(formData);
  if (!inviteId) {
    redirect("/admin?error=invalid_resend");
  }

  const workflow = buildAdminWorkflow();

  const result = await workflow.resendInvite({
    actorId: session.user.id,
    inviteId,
  });

  redirect(redirectTargetForResendInvite(result));
}

function readEmail(formData: FormData): string | null {
  const value = formData.get("email");
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRole(formData: FormData): UserRole | null {
  const value = formData.get("role");
  if (typeof value !== "string") {
    return null;
  }
  if (value === "user" || value === "organizer" || value === "admin") {
    return value;
  }
  return null;
}

function readUserId(formData: FormData): string | null {
  const value = formData.get("userId");
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readInviteId(formData: FormData): string | null {
  const value = formData.get("inviteId");
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readConfirmEmail(formData: FormData): string | null {
  const value = formData.get("confirmEmail");
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectTargetForInvite(
  result: Awaited<
    ReturnType<ReturnType<typeof buildAdminWorkflow>["inviteUser"]>
  >,
): string {
  if (result.ok) {
    return `/admin?invited=${encodeURIComponent(result.value.maskedEmail)}`;
  }
  const errorCode = inviteErrorToCode(result.error);
  return `/admin?error=${errorCode}`;
}

function redirectTargetForChangeRole(
  result: Awaited<
    ReturnType<ReturnType<typeof buildAdminWorkflow>["changeRole"]>
  >,
): string {
  if (result.ok) {
    return "/admin?role_change=saved";
  }
  const errorCode = changeRoleErrorToCode(result.error);
  return `/admin?error=${errorCode}`;
}

function redirectTargetForSuspend(
  result: Awaited<ReturnType<ReturnType<typeof buildAdminWorkflow>["suspend"]>>,
): string {
  if (result.ok) {
    return "/admin?action=suspended";
  }
  const errorCode = suspendErrorToCode(result.error);
  return `/admin?error=${errorCode}`;
}

function redirectTargetForReinstate(
  result: Awaited<
    ReturnType<ReturnType<typeof buildAdminWorkflow>["reinstate"]>
  >,
): string {
  if (result.ok) {
    return "/admin?action=reinstated";
  }
  const errorCode = reinstateErrorToCode(result.error);
  return `/admin?error=${errorCode}`;
}

function redirectTargetForResendInvite(
  result: Awaited<
    ReturnType<ReturnType<typeof buildAdminWorkflow>["resendInvite"]>
  >,
): string {
  if (result.ok) {
    return `/admin?invited=${encodeURIComponent(result.value.maskedEmail)}`;
  }
  const errorCode = resendInviteErrorToCode(result.error);
  return `/admin?error=${errorCode}`;
}

function inviteErrorToCode(error: AdminUserInviteError): string {
  switch (error) {
    case "self_invite":
      return "self_invite";
    case "email_already_invited":
      return "email_already_invited";
    case "invalid_email":
    case "invalid_role":
      return "invalid_invite";
    case "active_user":
    case "internal_error":
    default:
      return "invite_failed";
  }
}

function changeRoleErrorToCode(error: AdminUserChangeRoleError): string {
  switch (error) {
    case "self_role_change":
      return "self_role_change";
    case "user_not_found":
      return "user_not_found";
    case "invalid_role":
      return "invalid_role_change";
    case "internal_error":
    default:
      return "role_change_failed";
  }
}

function suspendErrorToCode(error: AdminUserSuspendError): string {
  switch (error) {
    case "self_suspend":
      return "self_suspend";
    case "user_already_suspended":
      return "user_already_suspended";
    case "user_not_found":
      return "user_not_found";
    case "confirm_email_mismatch":
      return "invalid_suspend";
    case "confirm_email_required":
      return "invalid_suspend";
    case "user_not_eligible":
    case "internal_error":
    default:
      return "suspend_failed";
  }
}

function reinstateErrorToCode(error: AdminUserReinstateError): string {
  switch (error) {
    case "self_reinstate":
      return "self_reinstate";
    case "user_already_active":
      return "user_already_active";
    case "user_not_found":
      return "user_not_found";
    case "internal_error":
    default:
      return "reinstate_failed";
  }
}

function resendInviteErrorToCode(error: AdminUserResendInviteError): string {
  switch (error) {
    case "invite_not_found":
      return "invite_not_found";
    case "user_already_active":
      return "email_already_invited";
    case "internal_error":
    default:
      return "resend_failed";
  }
}
