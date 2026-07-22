import { getSearchRepository } from "../../../../src/search/repository";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { requirePageContext } from "../../../../src/lib/page-context";
import { SearchResultClient } from "./SearchResultClient";

export default async function SearchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageContext({ roles: ["organizer", "admin"] });
  const { id } = await params;

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
