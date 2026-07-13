import { getSessionFromRequest } from "../../src/auth/session";
import { getSearchRepository } from "../../src/search/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (session.user.role !== "organizer" && session.user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const searchRepo = getSearchRepository();
  const searches = await searchRepo.listByOrganizer(session.user.id);

  return Response.json({
    searches: searches.map((s) => ({
      id: s.id,
      organizerId: s.organizerId,
      selectedTopicIds: s.selectedTopicIds,
      minimumMatchingUsers: s.minimumMatchingUsers,
      durationMinutes: s.durationMinutes,
      dateRangeStart: s.dateRangeStart.toISOString(),
      dateRangeEnd: s.dateRangeEnd.toISOString(),
      organizerTimezone: s.organizerTimezone,
      generatedAt: s.generatedAt.toISOString(),
    })),
  });
}
