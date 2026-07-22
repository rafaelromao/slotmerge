import {
  getSessionFromRequest,
  isOrganizerOrAdminSession,
} from "../../../../src/auth/session";
import { getSearchRepository } from "../../../../src/search/repository";

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerOrAdminSession(session)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const searches = await getSearchRepository().listAll();

  return Response.json(
    searches.map((s) => ({
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
  );
}
