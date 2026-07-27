import Link from "next/link";

import { requirePageContext } from "../../../../src/lib/page-context";
import { getSearchRepository } from "../../../../src/search/repository";
import { getTopicCatalogueRepository } from "../../../../src/topics/repository";
import { systemClock } from "../../../../src/system/clock";

function formatDateLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

function formatDateTimeLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

export default async function SearchHistoryPage() {
  await requirePageContext({ roles: ["organizer", "admin"] });

  const [history, topics] = await Promise.all([
    getSearchRepository().listSearchHistory(systemClock()),
    getTopicCatalogueRepository().listCatalogue(),
  ]);

  const topicById = new Map(topics.map((topic) => [topic.id, topic.name]));

  if (history.length === 0) {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">No Search history yet.</p>
          <p>Run a Search to see it here.</p>
          <Link href="/searches">Run a Search</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="search-history-page">
      <header className="search-history-header">
        <h1>Search History</h1>
        <p>Newest first.</p>
      </header>

      <ul className="search-history-list">
        {history.map((item) => {
          const selectedTopics = item.selectedTopicIds.map(
            (topicId) => topicById.get(topicId) ?? topicId,
          );

          return (
            <li key={item.id} className="search-history-row">
              <div className="search-history-row-main">
                <p>
                  <strong>Selected Topics:</strong> {selectedTopics.join(", ")}
                </p>
                <p>
                  <strong>Date Range:</strong>{" "}
                  {formatDateLabel(item.dateRangeStart, item.organizerTimezone)}
                  {" - "}
                  {formatDateLabel(item.dateRangeEnd, item.organizerTimezone)}
                </p>
                <p>
                  <strong>Generated:</strong>{" "}
                  <time dateTime={item.generatedAt.toISOString()}>
                    {formatDateTimeLabel(
                      item.generatedAt,
                      item.organizerTimezone,
                    )}
                  </time>
                </p>
                <p>
                  <strong>Search ID:</strong> {item.id}
                  {item.stale ? " · Stale" : ""}
                </p>
              </div>

              <div className="search-history-row-actions">
                <Link href={`/searches/${item.id}`}>Open Search Result</Link>
                <details className="rerun-search-confirm">
                  <summary>Re-run Search</summary>
                  <div className="rerun-search-confirm-panel">
                    <p>Re-run this Search?</p>
                    <form action={`/searches/${item.id}/rerun`} method="post">
                      <button type="submit">Re-run</button>
                    </form>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
