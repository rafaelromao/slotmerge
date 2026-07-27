"use server";

import { redirect } from "next/navigation";

import { getServerSession } from "../../../../../src/auth/session";
import { assertCsrfFromFormData, CsrfError } from "../../../../../src/lib/csrf";
import { getDiscoverableUserRepository } from "../../../../../src/search/discoverable-user-repository";
import { rerunSearch } from "../../../../../src/search/search-input";
import { getSearchResultRepository } from "../../../../../src/search/search-result-repository";
import { listActiveTopics } from "../../../../../src/topics/repository";
import { getProfileByUserId } from "../../../../../src/profile/repository";
import { systemClock } from "../../../../../src/system/clock";
import { createSearchWorkflow } from "../../../../../src/workflow/search";

function buildWorkflow() {
  return createSearchWorkflow({
    clock: systemClock(),
    profileRepository: {
      findByUserId: getProfileByUserId,
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

function buildRerunDependencies() {
  return {
    clock: systemClock(),
    profileRepository: {
      findByUserId: getProfileByUserId,
    },
    topicRepository: {
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
  };
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
  const session = await getServerSession();
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
  const opened = await workflow.openSnapshot({
    userId: session.user.id,
    searchId,
    isAdmin: session.user.role === "admin",
  });

  if (!opened.ok) {
    redirectWithReason(searchId, opened.error.reason);
  }

  const result = await rerunSearch(searchId, buildRerunDependencies());

  if (!result.ok) {
    redirectWithReason(searchId, result.reason);
  }

  redirectToSearch(result.search.id!);
}
