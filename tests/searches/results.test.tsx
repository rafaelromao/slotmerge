// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SearchResultClient } from "../../app/searches/[id]/results/SearchResultClient";
import type { SearchSnapshot, Slot } from "../../src/db/schema";

describe("SearchResultClient click-to-open flow", () => {
  const slot1: Slot = {
    startUtc: "2026-07-15T10:00:00.000Z",
    matchCount: 2,
    matches: [
      {
        userId: "user-1",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: "Computing pioneer",
        topics: [{ id: "topic-1", name: "Compilers" }],
        topicProfile: [
          { id: "topic-1", name: "Compilers" },
          { id: "topic-2", name: "Type Theory" },
        ],
        availabilityIndicator: "available",
        calendarFreshness: "fresh",
      },
    ],
  };

  const snapshot: SearchSnapshot = {
    generatedAt: "2026-07-13T00:00:00.000Z",
    organizerTimezone: "America/New_York",
    dateRangeStart: "2026-07-13T00:00:00.000Z",
    dateRangeEnd: "2026-07-19T23:59:59.000Z",
    durationMinutes: 60,
    slots: [slot1],
  };

  it("renders slot buttons with data-testid attributes", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).toContain("calendar-slot");
    expect(html).toMatch(/data-testid="slot-\d+-\d+"/);
  });

  it("does not render the drawer until a slot is selected", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).not.toContain("slot-details-drawer-overlay");
  });

  it("renders all days in the date range", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).toContain("calendar-grid");
    expect(html).toContain("calendar-day-header");
    expect(html).toContain("Search Result");
  });

  it("renders stale indicator when any match has stale calendar", () => {
    const staleSlot: Slot = {
      ...slot1,
      matches: [
        {
          ...slot1.matches[0],
          calendarFreshness: "stale",
        },
      ],
    };
    const staleSnapshot: SearchSnapshot = {
      ...snapshot,
      slots: [staleSlot],
    };
    const html = renderToString(
      <SearchResultClient
        snapshot={staleSnapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).toContain("slot-stale-indicator");
    expect(html).toContain("stale calendar data");
  });

  it("surfaces stale state on the slot button aria-label for screen readers", () => {
    const staleSlot: Slot = {
      ...slot1,
      matches: [
        {
          ...slot1.matches[0],
          calendarFreshness: "stale",
        },
      ],
    };
    const staleSnapshot: SearchSnapshot = {
      ...snapshot,
      slots: [staleSlot],
    };
    const html = renderToString(
      <SearchResultClient
        snapshot={staleSnapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).toMatch(
      /aria-label="[^"]*2 matches[^"]*stale calendar data/,
    );
  });

  it("marks the inline stale glyph as aria-hidden so it does not double-announce", () => {
    const staleSlot: Slot = {
      ...slot1,
      matches: [
        {
          ...slot1.matches[0],
          calendarFreshness: "stale",
        },
      ],
    };
    const staleSnapshot: SearchSnapshot = {
      ...snapshot,
      slots: [staleSlot],
    };
    const html = renderToString(
      <SearchResultClient
        snapshot={staleSnapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).toMatch(/slot-stale-indicator[^>]*aria-hidden="true"/);
  });

  it("does not render stale indicator for fresh data", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).not.toContain("slot-stale-indicator");
    expect(html).not.toContain("stale calendar data");
  });

  it("marks the calendar grid as a grid with an accessible name", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).toContain('role="grid"');
    expect(html).toContain("Weekly search results");
  });

  it("does not expose email addresses in rendered output", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
      />,
    );

    expect(html).not.toMatch(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    );
  });
});
