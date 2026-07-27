import { getDiscoverableUserRepository } from "../../../../../src/search/discoverable-user-repository";
import { getSearchResultRepository } from "../../../../../src/search/search-result-repository";
import { getProfileByUserId } from "../../../../../src/profile/repository";
import { listActiveTopics } from "../../../../../src/topics/repository";
import { systemClock } from "../../../../../src/system/clock";
import { rerunSearch } from "../../../../../src/search/search-input";
import { requirePageContext } from "../../../../../src/lib/page-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  await requirePageContext({ roles: ["organizer", "admin"] }, request);
  const { id } = await params;

  const result = await rerunSearch(id, {
    discoverableUserRepository: getDiscoverableUserRepository(),
    clock: systemClock(),
    searchResultRepository: getSearchResultRepository(),
    topicRepository: {
      async listActive() {
        const topics = await listActiveTopics();
        return topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          status: "active" as const,
        }));
      },
    },
    profileRepository: {
      findByUserId: getProfileByUserId,
    },
  });

  if (!result.ok) {
    return new Response("Search not found", { status: 404 });
  }

  return Response.redirect(
    new URL(`/searches/${result.search.id}`, request.url),
    303,
  );
}
