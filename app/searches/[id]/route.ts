import { getSessionFromRequest } from "../../../src/auth/session";
import { getSearchRepository } from "../../../src/search/repository";
import { getSearchResultRepository } from "../../../src/search/search-result-repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;

  const searchRepo = getSearchRepository();
  const search = await searchRepo.findById(id);

  if (!search) {
    return Response.json({ error: "search_not_found" }, { status: 404 });
  }

  const searchResultRepo = getSearchResultRepository();
  const result = await searchResultRepo.findBySearchId(id);

  return Response.json({
    search: {
      id: search.id,
      organizerId: search.organizerId,
      selectedTopicIds: search.selectedTopicIds,
      minimumMatchingUsers: search.minimumMatchingUsers,
      durationMinutes: search.durationMinutes,
      dateRangeStart: search.dateRangeStart.toISOString(),
      dateRangeEnd: search.dateRangeEnd.toISOString(),
      organizerTimezone: search.organizerTimezone,
      generatedAt: search.generatedAt.toISOString(),
    },
    snapshot: result?.snapshotJson ?? null,
  });
}
