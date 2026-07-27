import {
  getSessionFromRequest,
  isOrganizerOrAdminSession,
} from "../../../../src/auth/session";
import { problemJson } from "../../../../src/api/problem-json";
import { serializeSearchHistoryPage } from "../../../../src/api/serializers";
import {
  createSearchWorkflow,
  type SearchWorkflow,
} from "../../../../src/workflow/search";
import { getDiscoverableUserRepository } from "../../../../src/search/discoverable-user-repository";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { systemClock } from "../../../../src/system/clock";
import { getProfileByUserId } from "../../../../src/profile/repository";
import { listActiveTopics } from "../../../../src/topics/repository";

let workflowOverride: SearchWorkflow | null = null;

export function setSearchWorkflowForTests(workflow: SearchWorkflow | null) {
  workflowOverride = workflow;
}

function getSearchWorkflow(): SearchWorkflow {
  if (workflowOverride) {
    return workflowOverride;
  }

  return createSearchWorkflow({
    clock: systemClock(),
    profileRepository: { findByUserId: getProfileByUserId },
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

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return problemJson(401, {
      title: "Sign in required",
      detail:
        "Authenticate with a sealed session cookie to read Search history.",
    });
  }

  if (!isOrganizerOrAdminSession(session)) {
    return problemJson(403, {
      title: "Organizer access required",
      detail: "Only Organizer or Admin sessions can read Search history.",
    });
  }

  const result = await getSearchWorkflow().listHistory({
    userId: session.user.id,
  });

  if (!result.ok) {
    return problemJson(503, {
      title: "Search history unavailable",
      detail: "The Search history could not be read. Try again in a moment.",
    });
  }

  return Response.json(serializeSearchHistoryPage(result.value));
}
