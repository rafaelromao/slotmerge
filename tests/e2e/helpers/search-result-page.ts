/**
 * searchResultPage helper — runs an Organizer Search end-to-end and inspects
 * the rendered calendar and clicked Slot details drawer payload.
 *
 * E2E coverage: PRD stories 35-46 → tests 33-43 (organizer search slice)
 *
 * Usage:
 * ```ts
 * const result = await searchResultPage(sessionCookie, {
 *   selectedTopicIds: ["topic-1"],
 *   minimumMatchingUsers: 2,
 *   durationMinutes: 60,
 *   dateRangeStart: "2024-06-01T00:00:00Z",
 *   dateRangeEnd: "2024-06-08T00:00:00Z",
 *   timezone: "America/New_York",
 * });
 * expect(result.snapshot.weeklyGrid["2024-W22"]).toHaveLength(168); // hourly slots
 * ```
 */

import type { SearchResultSnapshot } from "./search-result-snapshot";

export type SearchParams = {
  selectedTopicIds: string[];
  minimumMatchingUsers?: number;
  durationMinutes?: number;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  timezone?: string;
};

export type WeeklyGrid = Record<
  string, // ISO week key "2024-W22"
  Array<{
    startTime: string;
    endTime: string;
    matchCount: number;
    stale: boolean;
  }>
>;

export type SlotDetails = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  topics: Array<{ id: string; name: string }>;
  availabilityIndicators: Record<string, boolean>;
  calendarFresh: boolean;
};

export type SearchResultPageResult = {
  snapshot: SearchResultSnapshot;
  calendarGrid: WeeklyGrid;
  slotDetails: SlotDetails[];
  response: Response;
};

export async function searchResultPage(
  sessionCookie: string,
  params: SearchParams,
): Promise<SearchResultPageResult> {
  const { POST: createSearch } = await import("../../../app/searches/route");
  const response = await createSearch(
    new Request("http://localhost/searches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        selectedTopicIds: params.selectedTopicIds,
        minimumMatchingUsers: params.minimumMatchingUsers ?? 2,
        durationMinutes: params.durationMinutes ?? 60,
        dateRangeStart:
          params.dateRangeStart ??
          new Date().toISOString().split("T")[0] + "T00:00:00Z",
        dateRangeEnd:
          params.dateRangeEnd ??
          new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0] + "T00:00:00Z",
        organizerTimezone: params.timezone ?? "UTC",
      }),
    }),
  );

  if (!response.ok) {
    throw new Error(
      `Search failed: ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as {
    snapshot: SearchResultSnapshot;
    redirectTo?: string;
  };

  const snapshot = body.snapshot;

  const calendarUrl = body.redirectTo ?? `http://localhost/searches/${snapshot.searchId}`;
  const calendarRes = await fetch(calendarUrl, {
    headers: { cookie: sessionCookie },
  });

  const html = await calendarRes.text();
  const grid = parseWeeklyGridFromHtml(html);

  const firstNonEmptySlot = findFirstNonEmptySlot(grid, snapshot);
  let slotDetails: SlotDetails[] = [];

  if (firstNonEmptySlot) {
    const detailsRes = await fetch(
      `http://localhost/searches/${snapshot.searchId}/slots/${firstNonEmptySlot.startTime}`,
      { headers: { cookie: sessionCookie } },
    );
    if (detailsRes.ok) {
      slotDetails = (await detailsRes.json()) as SlotDetails[];
    }
  }

  return {
    snapshot,
    calendarGrid: grid,
    slotDetails,
    response,
  };
}

function parseWeeklyGridFromHtml(html: string): WeeklyGrid {
  // Parse the weekly grid from the rendered HTML.
  // Expected HTML structure: data attributes or structured content
  // that represents the weekly slot grid.
  // This implementation is a placeholder that parses the snapshot data
  // embedded in the HTML when JS is disabled.
  const grid: WeeklyGrid = {};

  const snapshotMatch = html.match(
    /data-snapshot='([^"]+)'|id="search-snapshot">([^<]+)/,
  );
  if (snapshotMatch) {
    try {
      const snapshotJson = snapshotMatch[1] ?? snapshotMatch[2];
      const snapshot = JSON.parse(
        snapshotJson,
      ) as SearchResultSnapshot;
      return snapshot.weeklyGrid;
    } catch {
      // fall through to empty grid
    }
  }

  return grid;
}

function findFirstNonEmptySlot(
  grid: WeeklyGrid,
  snapshot: SearchResultSnapshot,
): { startTime: string } | null {
  for (const weekKey of Object.keys(grid)) {
    const slots = grid[weekKey] ?? snapshot.weeklyGrid[weekKey] ?? [];
    for (const slot of slots) {
      if (slot.matchCount > 0) {
        return { startTime: slot.startTime };
      }
    }
  }
  return null;
}
