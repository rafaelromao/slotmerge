import Link from "next/link";

import { requirePageContext } from "../../../../src/lib/page-context";
import { getDiscoverableUserRepository } from "../../../../src/search/discoverable-user-repository";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { listActiveTopics } from "../../../../src/topics/repository";
import { getProfileByUserId } from "../../../../src/profile/repository";
import { systemClock } from "../../../../src/system/clock";
import { createSearchWorkflow } from "../../../../src/workflow/search";
import { serializeSearchHistoryPage } from "../../../../src/api/serializers";
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

const HISTORY_PAGE_SIZE = 50;

function buildHistoryWorkflow() {
  return createSearchWorkflow({
    clock: systemClock(),
    profileRepository: {
      findByUserId: (userId) => getProfileByUserId(userId, systemClock()),
    },
    activeTopicsRepository: {
      async listActive() {
        const entries = await listActiveTopics();
        return entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: "active" as const,
        }));
      },
    },
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  });
}

export default async function SearchHistoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({ roles: ["organizer", "admin"] });
  const query = (await searchParams) ?? {};
  const before = readFirstString(query.before);

  const historyResult = await buildHistoryWorkflow().listHistory({
    userId: context.user.id,
  });

  if (!historyResult.ok) {
    return (
      <main className="app-container search-history-page">
        <header className="page-header search-history-header-page">
          <div className="page-header-copy">
            <p className="eyebrow">Searches</p>
            <h1>Search History</h1>
            <p>Visible to every Organizer and Admin.</p>
          </div>
          <Link href="/searches" className="btn btn-primary">
            Run a Search
          </Link>
        </header>
        <p
          className="form-error-banner"
          role="alert"
          data-testid="search-history-error-banner"
        >
          Search history is temporarily unavailable. Refresh the page to retry.
        </p>
      </main>
    );
  }

  const historyDto = serializeSearchHistoryPage(historyResult.value);

  const beforeIndex = before
    ? historyDto.history.findIndex((item) => item.id === before)
    : -1;
  const windowStart = beforeIndex >= 0 ? beforeIndex + 1 : 0;
  const windowEnd = windowStart + HISTORY_PAGE_SIZE;
  const pageHistory = historyDto.history.slice(windowStart, windowEnd);
  const hasMore = windowEnd < historyDto.history.length;

  if (pageHistory.length === 0) {
    return (
      <main className="app-container search-history-page">
        <div className="empty-state" data-testid="search-history-empty-state">
          <p className="empty-state-title">No Searches yet</p>
          <p className="empty-state-description">
            Run a Search to populate history.
          </p>
          <Link
            href="/searches"
            className="btn btn-primary"
            data-testid="search-history-empty-state-cta"
          >
            Run your first Search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-container search-history-page">
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Searches</p>
          <h1>Search History</h1>
          <p className="page-description">
            Immutable snapshots, newest first. Visible to every Organizer and
            Admin.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/searches" className="btn btn-primary">
            Run a Search
          </Link>
        </div>
      </header>

      <div className="data-table-wrapper" data-testid="search-history-list">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Organizer</th>
              <th scope="col">Status</th>
              <th scope="col">Topics</th>
              <th scope="col">Minimum</th>
              <th scope="col">Duration</th>
              <th scope="col">Date range</th>
              <th scope="col">Generated</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageHistory.map((item) => {
              const openHref = `/searches/${item.id}?week=${formatWeekParam(new Date(item.dateRangeStart), item.organizerTimezone)}`;
              return (
                <tr key={item.id} data-testid="search-history-row">
                  <td>
                    <strong>{item.organizerDisplayName}</strong>
                  </td>
                  <td>
                    <span
                      className={`status-pill ${
                        item.stale ? "status-pill-warn" : "status-pill-ok"
                      }`}
                      data-testid={`search-history-status-${item.id}`}
                    >
                      {item.stale ? "Stale" : "Fresh"}
                    </span>
                  </td>
                  <td>{item.selectedTopicNames.join(", ")}</td>
                  <td className="data-table-numeric">
                    {item.minimumMatchingUsers} people
                  </td>
                  <td className="data-table-numeric">
                    {item.durationMinutes} min
                  </td>
                  <td className="search-history-daterange">
                    {formatDateLabel(
                      new Date(item.dateRangeStart),
                      item.organizerTimezone,
                    )}
                    <span aria-hidden="true">→</span>
                    {formatDateLabel(
                      new Date(item.dateRangeEnd),
                      item.organizerTimezone,
                    )}
                  </td>
                  <td className="data-table-numeric">
                    <time dateTime={item.generatedAt}>
                      {formatDateTimeLabel(
                        new Date(item.generatedAt),
                        item.organizerTimezone,
                      )}
                    </time>
                  </td>
                  <td className="data-table-actions">
                    <Link
                      href={openHref}
                      className="btn btn-secondary"
                      data-testid="search-history-open-snapshot"
                    >
                      Open
                    </Link>
                    <form action={rerunSearchAction}>
                      <input
                        type="hidden"
                        name="_csrf"
                        value={context.csrfToken}
                      />
                      <input type="hidden" name="searchId" value={item.id} />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        data-testid="search-history-rerun"
                      >
                        Re-run
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <Link
          className="btn btn-secondary search-history-load-more"
          data-testid="search-history-load-more"
          href={`/searches/history?before=${encodeURIComponent(pageHistory.at(-1)?.id ?? "")}`}
        >
          Load more
        </Link>
      ) : null}
    </main>
  );
}
