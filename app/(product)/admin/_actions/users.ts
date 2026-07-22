"use server";

import { redirect } from "next/navigation";

import { getServerSession } from "../../../../src/auth/session";
import { CsrfError, csrfErrorResponse } from "../../../../src/lib/csrf";
import {
  createAdminUsersWorkflow,
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

export async function inviteUserAction(formData: FormData): Promise<void> {
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
      return;
    }
    throw error;
  }

  const email = readEmail(formData);
  const role = readRole(formData);
  if (!email || !role) {
    redirect("/admin?error=invalid_invite");
  }

  const config = loadRuntimeConfig();
  const workflow = createAdminUsersWorkflow({
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

  const result = await workflow.inviteUser({
    actorId: session.user.id,
    actorEmail: session.user.email,
    email,
    role,
  });

  redirect(redirectTargetFor(result));
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

function redirectTargetFor(result: AdminUserInviteResult): string {
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
