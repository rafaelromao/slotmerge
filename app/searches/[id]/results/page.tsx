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
      <main>
        <p>You must be logged in to view this page.</p>
      </main>
    );
  }

  if (session.user.role !== "organizer" && session.user.role !== "admin") {
    return (
      <main>
        <p>You do not have permission to view this page.</p>
      </main>
    );
  }

  const searchRepo = getSearchRepository();
  const search = await searchRepo.findById(id);

  if (!search) {
    return (
      <main>
        <p>Search not found.</p>
      </main>
    );
  }

  const searchResultRepo = getSearchResultRepository();
  const result = await searchResultRepo.findBySearchId(id);

  if (!result) {
    return (
      <main>
        <p>No snapshot available for this search.</p>
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
