import Link from "next/link";

import { requirePageContext } from "../../../../src/lib/page-context";
import { getDiscoverableUserRepository } from "../../../../src/search/discoverable-user-repository";
import {
  alignToMonday,
  getSlotsForWeek,
} from "../../../../src/search/calendar-utils";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { addCivilDays, zonedTimeToUtc } from "../../../../src/search/timezone";
import { listActiveTopics } from "../../../../src/topics/repository";
import { systemClock } from "../../../../src/system/clock";
import { createSearchWorkflow } from "../../../../src/workflow/search";
import { serializeSearchSnapshot } from "../../../../src/api/serializers";
import { rerunSearchAction } from "./_actions/rerun-search";
import { SearchResultClient } from "./SearchResultClient";

type SearchParams = Promise<{
  week?: string | string[];
  rerun?: string | string[];
}>;

type CalendarDate = { year: number; month: number; day: number };

function parseWeekParam(
  value: string | string[] | undefined,
): CalendarDate | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
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

function readFirstString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function rerunMessage(reason: string | undefined): string | null {
  if (!reason) return null;
  if (reason === "csrf_error") {
    return "Your session expired. Re-open the Search and try again.";
  }
  if (reason === "topics_invalid") {
    return "One or more Topics are no longer active. Pick a different Topic set and re-run.";
  }
  return "That Search is no longer available.";
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
  const rerunReason = rerunMessage(readFirstString(query.rerun));

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

  const snapshotDto = opened.ok
    ? serializeSearchSnapshot(opened.value)
    : null;
  void snapshotDto;

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

  const requestedWeek = parseWeekParam(query.week);
  const weekStart = alignToMonday(
    requestedWeek
      ? zonedTimeToUtc(
          requestedWeek.year,
          requestedWeek.month - 1,
          requestedWeek.day,
          opened.value.search.organizerTimezone,
        )
      : new Date(opened.value.snapshot.dateRangeStart),
    opened.value.search.organizerTimezone,
  );
  const weekEnd = addCivilDays(
    weekStart,
    7,
    opened.value.search.organizerTimezone,
  );
  const weeklySlots = getSlotsForWeek(opened.value.snapshot, weekStart);
  const dateRangeStart = new Date(opened.value.search.dateRangeStart);
  const dateRangeEnd = new Date(opened.value.search.dateRangeEnd);
  const prevWeekStart =
    weekStart.getTime() > dateRangeStart.getTime()
      ? addCivilDays(weekStart, -7, opened.value.search.organizerTimezone)
      : null;
  const nextWeekCandidate = addCivilDays(
    weekStart,
    7,
    opened.value.search.organizerTimezone,
  );
  const nextWeekStart =
    nextWeekCandidate.getTime() < dateRangeEnd.getTime()
      ? nextWeekCandidate
      : null;
  const emptyStatePrimaryHref = nextWeekStart
    ? `/searches/${id}?week=${formatWeekParam(nextWeekStart, opened.value.search.organizerTimezone)}`
    : "/searches/history";
  const emptyStatePrimaryLabel = nextWeekStart
    ? "Next week"
    : "Open in history";

  const actions = (
    <div className="search-result-actions">
      <Link href="/searches/history">Open in history</Link>
      <button type="button" popoverTarget={`rerun-search-confirm-${id}`}>
        Re-run Search
      </button>
      <div id={`rerun-search-confirm-${id}`} popover="auto">
        <div className="rerun-search-confirm-panel">
          <p>Re-run this Search?</p>
          <form
            action={rerunSearchAction}
            className="rerun-search-confirm-form"
          >
            <input type="hidden" name="_csrf" value={context.csrfToken} />
            <input type="hidden" name="searchId" value={id} />
            <button type="submit">Re-run</button>
          </form>
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

      {rerunReason ? (
        <p className="form-error-banner" role="alert">
          {rerunReason}
        </p>
      ) : null}

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

      {weeklySlots.length > 0 ? (
        <>
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
        </>
      ) : (
        <div className="empty-state" data-testid="search-result-empty-state">
          <p className="empty-state-title">No matching Slots this week.</p>
          <p>Try the next week or review Search history.</p>
          <Link href={emptyStatePrimaryHref}>{emptyStatePrimaryLabel}</Link>
        </div>
      )}

      {actions}
    </main>
  );
}
