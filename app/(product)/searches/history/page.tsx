import Link from "next/link";

import { requirePageContext } from "../../../../src/lib/page-context";
import { getProfileByUserId } from "../../../../src/profile/repository";
import { getSearchRepository } from "../../../../src/search/repository";
import { getTopicCatalogueRepository } from "../../../../src/topics/repository";
import { systemClock } from "../../../../src/system/clock";
import { rerunSearchAction } from "../[id]/_actions/rerun-search";

type SearchParams = Promise<{
  before?: string | string[];
}>;

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

function formatWeekParam(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day
    ? `${year}-${month}-${day}`
    : date.toISOString().slice(0, 10);
}

function readFirstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SearchHistoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({ roles: ["organizer", "admin"] });
  const repository = getSearchRepository();
  const history = await repository.listSearchHistory(systemClock());
  const query = (await searchParams) ?? {};
  const before = readFirstString(query.before);
  const beforeIndex = before
    ? history.findIndex((item) => item.id === before)
    : -1;
  const windowStart = beforeIndex >= 0 ? beforeIndex + 1 : 0;
  const windowEnd = windowStart + 50;
  const pageHistory = history.slice(windowStart, windowEnd);
  const hasMore = windowEnd < history.length;
  const topicCatalogue = await getTopicCatalogueRepository().listCatalogue();
  const historyWithDetails = await Promise.all(
    pageHistory.map(async (item) => {
      const profile = await getProfileByUserId(item.organizerId);
      return {
        ...item,
        organizerDisplayName: profile?.displayName?.trim() || item.organizerId,
        selectedTopicNames: item.selectedTopicIds.map(
          (topicId) =>
            topicCatalogue.find((topic) => topic.id === topicId)?.name ??
            topicId,
        ),
      };
    }),
  );

  if (historyWithDetails.length === 0) {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">No Searches yet.</p>
          <p>Run a Search to populate history.</p>
          <Link href="/searches">Run a Search</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-container search-history-page">
      <header>
        <h1>Search History</h1>
        <p>Visible to every Organizer and Admin.</p>
      </header>

      <ol className="search-history-list">
        {historyWithDetails.map((item) => {
          const openHref = `/searches/${item.id}?week=${formatWeekParam(item.dateRangeStart, item.organizerTimezone)}`;
          return (
            <li key={item.id} className="search-history-row">
              <article>
                <h2>{item.organizerDisplayName}</h2>
                <p>
                  {formatDateTimeLabel(
                    item.generatedAt,
                    item.organizerTimezone,
                  )}
                </p>
                <p>Topics: {item.selectedTopicNames.join(", ")}</p>
                <p>
                  Minimum {item.minimumMatchingUsers}, {item.durationMinutes}{" "}
                  minutes
                </p>
                <p>
                  Date Range:{" "}
                  {formatDateLabel(item.dateRangeStart, item.organizerTimezone)}{" "}
                  - {formatDateLabel(item.dateRangeEnd, item.organizerTimezone)}
                </p>
                <p>Organizer timezone: {item.organizerTimezone}</p>
                <p>
                  {item.stale
                    ? "⚠ include stale calendar data"
                    : "Fresh snapshot"}
                </p>
                <div className="search-history-actions">
                  <Link href={openHref}>Open snapshot</Link>
                  <form action={rerunSearchAction}>
                    <input
                      type="hidden"
                      name="_csrf"
                      value={context.csrfToken}
                    />
                    <input type="hidden" name="searchId" value={item.id} />
                    <button type="submit">Re-run</button>
                  </form>
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      {hasMore ? (
        <Link
          className="search-history-load-more"
          href={`/searches/history?before=${encodeURIComponent(pageHistory.at(-1)?.id ?? "")}`}
        >
          Load more
        </Link>
      ) : null}
    </main>
  );
}
