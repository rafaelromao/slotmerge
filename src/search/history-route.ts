import { getSessionFromRequest, isOrganizerOrAdminSession, type Session } from "../auth/session";
import { getSearchRepository, type SearchHistoryItem, type SearchRepository } from "./repository";
import { getSearchResultRepository, type SearchResultRepository } from "./search-result-repository";

export type SearchHistoryDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  searchRepository?: SearchRepository;
  searchResultRepository?: SearchResultRepository;
};

export function createSearchHistoryHandlers({
  getSession = getSessionFromRequest,
  searchRepository = getSearchRepository(),
  searchResultRepository = getSearchResultRepository(),
}: SearchHistoryDependencies = {}) {
  return {
    async getHistory(request: Request): Promise<Response> {
      const session = await getSession(request);

      if (!isOrganizerOrAdminSession(session)) {
        return Response.json({ error: "forbidden" }, { status: 403 });
      }

      const history: SearchHistoryItem[] = await searchRepository.listSearchHistory();

      return Response.json({ history });
    },

    async getSnapshot(request: Request, searchId: string): Promise<Response> {
      const session = await getSession(request);

      if (!isOrganizerOrAdminSession(session)) {
        return Response.json({ error: "forbidden" }, { status: 403 });
      }

      const snapshot = await searchResultRepository.findBySearchId(searchId);

      if (!snapshot) {
        return Response.json({ error: "not_found" }, { status: 404 });
      }

      return Response.json({
        id: snapshot.id,
        searchId: snapshot.searchId,
        snapshotJson: snapshot.snapshotJson,
        createdAt: snapshot.createdAt.toISOString(),
      });
    },
  };
}
