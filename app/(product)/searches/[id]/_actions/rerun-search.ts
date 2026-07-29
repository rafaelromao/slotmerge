"use server";

import { redirect } from "next/navigation";
import { systemClock } from "../../../../../src/system/clock";

import { getServerSession } from "../../../../../src/auth/session";
import { assertCsrfFromFormData, CsrfError } from "../../../../../src/lib/csrf";
import { getDiscoverableUserRepository } from "../../../../../src/search/discoverable-user-repository";
import { getSearchResultRepository } from "../../../../../src/search/search-result-repository";
import { listActiveTopics } from "../../../../../src/topics/repository";
import { getProfileByUserId } from "../../../../../src/profile/repository";
import { createSearchWorkflow } from "../../../../../src/workflow/search";

function buildWorkflow() {
  return createSearchWorkflow({
    clock: systemClock(),
    profileRepository: {
      findByUserId: (userId) => getProfileByUserId(userId, systemClock()),
    },
    activeTopicsRepository: {
      async listActive() {
        const entries = await listActiveTopics();
        return entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: "active" as const,
        }));
      },
    },
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  });
}

function readSearchId(formData: FormData): string | null {
  const value = formData.get("searchId");
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectToSearch(searchId: string): never {
  redirect(`/searches/${searchId}`);
}

function redirectWithReason(searchId: string, reason: string): never {
  redirect(`/searches/${searchId}?rerun=${encodeURIComponent(reason)}`);
}

export async function rerunSearchAction(formData: FormData): Promise<void> {
  const session = await getServerSession({ clock: systemClock() });
  const searchId = readSearchId(formData);

  if (!searchId) {
    redirect("/searches");
  }

  if (
    !session ||
    (session.user.role !== "organizer" && session.user.role !== "admin")
  ) {
    redirect(
      `/sign-in?returnTo=${encodeURIComponent(`/searches/${searchId}`)}`,
    );
  }

  try {
    assertCsrfFromFormData(formData, session);
  } catch (error) {
    if (error instanceof CsrfError) {
      redirectWithReason(searchId, "csrf_error");
    }
    throw error;
  }

  const workflow = buildWorkflow();
  const result = await workflow.rerun({
    userId: session.user.id,
    searchId,
  });

  if (!result.ok) {
    redirectWithReason(searchId, result.error.reason);
  }

  redirectToSearch(result.value.searchId);
}
