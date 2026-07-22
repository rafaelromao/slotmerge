"use server";

import { redirect } from "next/navigation";

import { getServerSession } from "../../../../src/auth/session";
import { CsrfError, csrfErrorResponse } from "../../../../src/lib/csrf";
import {
  createAdminUsersWorkflow,
  type AdminUserChangeRoleResult,
  type AdminUserInviteResult,
} from "../../../../src/admin/users.workflow";
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

async function assertAdminAndCsrf(
  formData: FormData,
): Promise<{
  session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
}> {
  const session = await getServerSession();
  if (!session || session.user.role !== "admin") {
    redirect("/sign-in?returnTo=%2Fadmin");
  }
  try {
    const { assertCsrfFromFormData } = await import("../../../../src/lib/csrf");
    assertCsrfFromFormData(formData, session);
  } catch (error) {
    if (error instanceof CsrfError) {
      csrfErrorResponse();
    }
    throw error;
  }
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

function redirectTargetForInvite(result: AdminUserInviteResult): string {
  if (result.ok) {
    return `/admin?invited=${encodeURIComponent(result.maskedEmail)}`;
  }
  switch (result.reason) {
    case "self_invite":
      return "/admin?error=self_invite";
    case "email_already_invited":
      return "/admin?error=email_already_invited";
    case "internal_error":
    default:
      return "/admin?error=invite_failed";
  }
}

function redirectTargetForChangeRole(
  result: AdminUserChangeRoleResult,
): string {
  if (result.ok) {
    return "/admin?role_change=saved";
  }
  switch (result.reason) {
    case "self_role_change":
      return "/admin?error=self_role_change";
    case "user_not_found":
      return "/admin?error=user_not_found";
    case "internal_error":
    default:
      return "/admin?error=role_change_failed";
  }
}
