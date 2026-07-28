import {
  getSessionFromRequest,
  isOrganizerOrAdminSession,
} from "../../../../../src/auth/session";
import { problemJson } from "../../../../../src/api/problem-json";
import { serializeSearchSnapshot } from "../../../../../src/api/serializers";
import {
  createSearchWorkflow,
  type SearchWorkflow,
} from "../../../../../src/workflow/search";
import { getDiscoverableUserRepository } from "../../../../../src/search/discoverable-user-repository";
import { getSearchResultRepository } from "../../../../../src/search/search-result-repository";
import { systemClock } from "../../../../../src/system/clock";
import { getProfileByUserId } from "../../../../../src/profile/repository";
import { listActiveTopics } from "../../../../../src/topics/repository";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return problemJson(401, {
      title: "Sign in required",
      detail:
        "Authenticate with a sealed session cookie to read a Search Result.",
    });
  }

  if (!isOrganizerOrAdminSession(session)) {
    return problemJson(403, {
      title: "Organizer access required",
      detail: "Only Organizer or Admin sessions can read a Search Result.",
    });
  }

  const { id } = await params;
  const result = await getSearchWorkflow().openSnapshot({
    userId: session.user.id,
    searchId: id,
    isAdmin: session.user.role === "admin",
  });

  if (!result.ok) {
    if (result.error.reason === "search_not_found") {
      return problemJson(404, {
        title: "Search not found",
        detail: "No Search with that id is available.",
      });
    }
    return problemJson(404, {
      title: "Snapshot not found",
      detail: "The Search Result snapshot is missing for this Search.",
    });
  }

  return Response.json(serializeSearchSnapshot(result.value));
}
