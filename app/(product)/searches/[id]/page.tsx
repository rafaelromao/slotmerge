import { cookies } from "next/headers";
import { getSessionFromRequest } from "../../../../src/auth/session";
import { getSearchRepository } from "../../../../src/search/repository";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { SearchResultClient } from "./SearchResultClient";

export default async function SearchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const request = new Request("http://localhost", {
    headers: {
      cookie: cookieStore.toString(),
    },
  });
  const session = await getSessionFromRequest(request);

  if (!session) {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">Sign in required</p>
          <p>You must be logged in to view this page.</p>
        </div>
      </main>
    );
  }

  if (session.user.role !== "organizer" && session.user.role !== "admin") {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">Permission denied</p>
          <p>You do not have permission to view this page.</p>
        </div>
      </main>
    );
  }

  const searchRepo = getSearchRepository();
  const search = await searchRepo.findById(id);

  if (!search) {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">Search not found</p>
          <p>Search not found.</p>
        </div>
      </main>
    );
  }

  const searchResultRepo = getSearchResultRepository();
  const result = await searchResultRepo.findBySearchId(id);

  if (!result) {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">Snapshot unavailable</p>
          <p>No snapshot available for this search.</p>
        </div>
      </main>
    );
  }

  return (
    <SearchResultClient
      snapshot={result.snapshotJson}
      organizerTimezone={search.organizerTimezone}
    />
  );
}
