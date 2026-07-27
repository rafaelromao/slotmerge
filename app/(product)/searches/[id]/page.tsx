import Link from "next/link";

import { requirePageContext } from "../../../../src/lib/page-context";
import { getDiscoverableUserRepository } from "../../../../src/search/discoverable-user-repository";
import {
  alignToMonday,
  getSlotsForWeek,
} from "../../../../src/search/calendar-utils";
import {
  getSearchResultRepository,
} from "../../../../src/search/search-result-repository";
import { listActiveTopics } from "../../../../src/topics/repository";
import { systemClock } from "../../../../src/system/clock";
import { createSearchWorkflow } from "../../../../src/workflow/search";
import { SearchResultClient } from "./SearchResultClient";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
type SearchParams = Promise<{ week?: string | string[] }>;

function parseWeekParam(value: string | string[] | undefined): Date | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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

export default async function SearchResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParams;
}) {
  const context = await requirePageContext({ roles: ["organizer", "admin"] });
  const { id } = await params;
  const query = (await searchParams) ?? {};

  const workflow = createSearchWorkflow({
    clock: systemClock(),
    profileRepository: { findByUserId: () => Promise.resolve(null) },
    activeTopicsRepository: {
      async listActive() {
        return (await listActiveTopics()).map((topic) => ({
          id: topic.id,
          name: topic.name,
          status: "active" as const,
        }));
      },
    },
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  });

  const opened = await workflow.openSnapshot({
    userId: context.user.id,
    searchId: id,
    isAdmin: context.isAdmin,
  });

  if (!opened.ok) {
    return (
      <main className="app-container">
        <div className="empty-state">
          <p className="empty-state-title">
            {opened.error.reason === "search_not_found"
              ? "Search not found"
              : "Snapshot unavailable"}
          </p>
          <p>
            {opened.error.reason === "search_not_found"
              ? "Search not found."
              : "No snapshot available for this search."}
          </p>
          <Link href="/searches">Run a Search</Link>
        </div>
      </main>
    );
  }

  const weekStart = alignToMonday(
    parseWeekParam(query.week) ??
      new Date(opened.value.snapshot.dateRangeStart),
    opened.value.search.organizerTimezone,
  );
  const weekEnd = new Date(weekStart.getTime() + WEEK_MS - 1);
  const weeklySlots = getSlotsForWeek(opened.value.snapshot, weekStart);
  const dateRangeStart = new Date(opened.value.search.dateRangeStart);
  const dateRangeEnd = new Date(opened.value.search.dateRangeEnd);
  const prevWeekStart =
    weekStart.getTime() > dateRangeStart.getTime()
      ? new Date(weekStart.getTime() - WEEK_MS)
      : null;
  const nextWeekStart =
    weekStart.getTime() + WEEK_MS < dateRangeEnd.getTime()
      ? new Date(weekStart.getTime() + WEEK_MS)
      : null;

  const actions = (
    <div className="search-result-actions">
      <Link href="/searches/history">Open in history</Link>
      <button type="button" popoverTarget={`rerun-search-confirm-${id}`}>
        Re-run Search
      </button>
      <div id={`rerun-search-confirm-${id}`} popover="auto">
        <div className="rerun-search-confirm-panel">
          <p>Re-run this Search?</p>
        </div>
      </div>
    </div>
  );

  return (
    <main className="search-result-page">
      <header className="search-result-header">
        <h1>Search Result</h1>
        <p className="search-result-header-meta">
          <span>
            <strong>Selected Topics:</strong>{" "}
            {opened.value.selectedTopics.map((topic) => topic.name).join(", ")}
          </span>
          <span>
            <strong>Minimum:</strong> {opened.value.search.minimumMatchingUsers}
          </span>
          <span>
            <strong>Duration:</strong> {opened.value.search.durationMinutes}{" "}
            minutes
          </span>
          <span>
            <strong>Date Range:</strong>{" "}
            {formatDateLabel(
              dateRangeStart,
              opened.value.search.organizerTimezone,
            )}{" "}
            -{" "}
            {formatDateLabel(
              dateRangeEnd,
              opened.value.search.organizerTimezone,
            )}
          </span>
          <span>
            <strong>Organizer timezone:</strong>{" "}
            {opened.value.search.organizerTimezone}
          </span>
          <span>
            <strong>Generated:</strong>{" "}
            <time dateTime={opened.value.search.generatedAt.toISOString()}>
              {formatDateTimeLabel(
                new Date(opened.value.search.generatedAt),
                opened.value.search.organizerTimezone,
              )}
            </time>
          </span>
          <span>
            <strong>Search ID:</strong> {opened.value.search.id}
          </span>
        </p>
      </header>

      <nav
        className="search-result-week-nav"
        aria-label="Search result week navigation"
      >
        {prevWeekStart ? (
          <Link
            href={`/searches/${id}?week=${formatWeekParam(prevWeekStart, opened.value.search.organizerTimezone)}`}
          >
            Previous week
          </Link>
        ) : (
          <span aria-disabled="true">Previous week</span>
        )}
        <span>
          Week of{" "}
          {formatDateLabel(weekStart, opened.value.search.organizerTimezone)}
        </span>
        {nextWeekStart ? (
          <Link
            href={`/searches/${id}?week=${formatWeekParam(nextWeekStart, opened.value.search.organizerTimezone)}`}
          >
            Next week
          </Link>
        ) : (
          <span aria-disabled="true">Next week</span>
        )}
      </nav>

      <SearchResultClient
        snapshot={opened.value.snapshot}
        organizerTimezone={opened.value.search.organizerTimezone}
        weekStart={weekStart}
        weekEnd={weekEnd}
        slots={weeklySlots}
      />

      <p className="search-result-stale-note">
        Cells marked ⚠ include stale calendar data. The Match list may be
        smaller than the count suggests.
      </p>

      {actions}
    </main>
  );
}
