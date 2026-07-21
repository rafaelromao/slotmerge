import {
  getSessionFromRequest,
  isOrganizerOrAdminSession,
} from "../../../../../src/auth/session";
import { getSearchRepository } from "../../../../../src/search/repository";
import { getSearchResultRepository } from "../../../../../src/search/search-result-repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerOrAdminSession(session)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const search = await getSearchRepository().findById(id);

  if (!search) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const result = await getSearchResultRepository().findBySearchId(id);

  return Response.json({
    id: search.id,
    organizerId: search.organizerId,
    selectedTopicIds: search.selectedTopicIds,
    minimumMatchingUsers: search.minimumMatchingUsers,
    durationMinutes: search.durationMinutes,
    dateRangeStart: search.dateRangeStart.toISOString(),
    dateRangeEnd: search.dateRangeEnd.toISOString(),
    organizerTimezone: search.organizerTimezone,
    generatedAt: search.generatedAt.toISOString(),
    snapshot: result?.snapshotJson ?? null,
  });
}
