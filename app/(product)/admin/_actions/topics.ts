"use server";

import { redirect } from "next/navigation";

import { getServerSession } from "../../../../src/auth/session";
import { CsrfError, assertCsrfFromFormData } from "../../../../src/lib/csrf";
import { systemClock } from "../../../../src/system/clock";
import {
  createAdminTopicsWorkflow,
  type AdminTopicsDecideError,
  type AdminTopicsRetireError,
} from "../../../../src/workflow/admin-topics";
import { getTopicAdminRepository } from "../../../../src/topics/repository";

async function authorize(formData: FormData) {
  const session = await getServerSession();
  if (!session || session.user.role !== "admin") {
    redirect("/sign-in?returnTo=%2Fadmin");
  }
  try {
    assertCsrfFromFormData(formData, session);
  } catch (error) {
    if (error instanceof CsrfError) redirect("/admin?csrf=failed#topics");
    throw error;
  }
  return session;
}

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildWorkflow() {
  return createAdminTopicsWorkflow({
    repository: getTopicAdminRepository(),
    clock: systemClock(),
  });
}

function adminErrorSlug(
  error: AdminTopicsDecideError | AdminTopicsRetireError,
) {
  switch (error) {
    case "cannot_retire_own_proposal":
      return "topic_cannot_retire_own_proposal";
    case "topic_not_found":
      return "topic_not_found";
    case "topic_already_retired":
      return "topic_already_retired";
    case "confirm_name_required":
      return "topic_confirm_name_required";
    case "confirm_name_mismatch":
      return "topic_confirm_name_mismatch";
    case "proposal_not_found":
      return "topic_proposal_not_found";
    case "proposal_already_decided":
      return "topic_proposal_already_decided";
    default:
      return "topic_error_unknown";
  }
}

export async function approveProposalAction(formData: FormData): Promise<void> {
  const session = await authorize(formData);
  const proposalId = field(formData, "proposalId");
  if (!proposalId) redirect("/admin?error=topic_proposal_invalid#topics");
  const result = await buildWorkflow().decideProposal({
    actorId: session.user.id,
    proposalId,
    status: "approved",
  });
  if (result.ok) {
    redirect("/admin?action=topic_approved#topics");
  }
  redirect(`/admin?error=${adminErrorSlug(result.error)}#topics`);
}

export async function rejectProposalAction(formData: FormData): Promise<void> {
  const session = await authorize(formData);
  const proposalId = field(formData, "proposalId");
  if (!proposalId) redirect("/admin?error=topic_proposal_invalid#topics");
  const result = await buildWorkflow().decideProposal({
    actorId: session.user.id,
    proposalId,
    status: "rejected",
  });
  if (result.ok) {
    redirect("/admin?action=topic_rejected#topics");
  }
  redirect(`/admin?error=${adminErrorSlug(result.error)}#topics`);
}

export async function retireTopicAction(formData: FormData): Promise<void> {
  const session = await authorize(formData);
  const topicId = field(formData, "topicId");
  if (!topicId) redirect("/admin?error=topic_invalid_topic#topics");
  const result = await buildWorkflow().retireTopic({
    actorId: session.user.id,
    topicId,
    confirmName: field(formData, "confirmName"),
  });
  if (result.ok) {
    redirect("/admin?action=topic_retired#topics");
  }
  redirect(`/admin?error=${adminErrorSlug(result.error)}#topics`);
}
