// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SearchResultClient } from "../../app/(product)/searches/[id]/SearchResultClient";
import type { SearchSnapshot, Slot } from "../../src/db/schema";
import { addCivilDays } from "../../src/search/timezone";

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
        weekStart={new Date(snapshot.dateRangeStart)}
        weekEnd={new Date(snapshot.dateRangeEnd)}
        slots={snapshot.slots}
      />,
    );

    expect(html).toContain("calendar-slot");
    expect(html).toMatch(/data-testid="slot-\d+-\d+"/);
  });

  it("keeps both Slots when two UTC times land on the same local hour during fall-back DST", () => {
    const duplicateHourSlots: Slot[] = [
      {
        ...slot1,
        startUtc: "2026-11-01T05:00:00.000Z",
      },
      {
        ...slot1,
        startUtc: "2026-11-01T06:00:00.000Z",
      },
    ];
    const duplicateHourSnapshot: SearchSnapshot = {
      ...snapshot,
      dateRangeStart: "2026-10-26T04:00:00.000Z",
      dateRangeEnd: "2026-11-02T05:00:00.000Z",
      slots: duplicateHourSlots,
    };

    const html = renderToString(
      <SearchResultClient
        snapshot={duplicateHourSnapshot}
        organizerTimezone="America/New_York"
        weekStart={new Date(duplicateHourSnapshot.dateRangeStart)}
        weekEnd={new Date(duplicateHourSnapshot.dateRangeEnd)}
        slots={duplicateHourSnapshot.slots}
      />,
    );

    expect(html).toContain('data-testid="slot-6-0"');
    expect(html).toContain('data-testid="slot-6-1"');
    expect(html.match(/data-testid="slot-6-\d+"/g)).toHaveLength(2);
  });

  it("opens the Slot Details drawer when a slot button is clicked", () => {
    const { getByTestId, getByText } = render(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
        weekStart={new Date(snapshot.dateRangeStart)}
        weekEnd={new Date(snapshot.dateRangeEnd)}
        slots={snapshot.slots}
      />,
    );

    fireEvent.click(getByTestId("slot-3-0"));

    expect(getByTestId("slot-details-drawer")).toBeTruthy();
    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText(/No booking actions in MVP\./)).toBeTruthy();
  });

  it("does not render the drawer until a slot is selected", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
        weekStart={new Date(snapshot.dateRangeStart)}
        weekEnd={new Date(snapshot.dateRangeEnd)}
        slots={snapshot.slots}
      />,
    );

    expect(html).not.toContain("slot-details-drawer-overlay");
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
        weekStart={new Date(staleSnapshot.dateRangeStart)}
        weekEnd={new Date(staleSnapshot.dateRangeEnd)}
        slots={staleSnapshot.slots}
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
        weekStart={new Date(staleSnapshot.dateRangeStart)}
        weekEnd={new Date(staleSnapshot.dateRangeEnd)}
        slots={staleSnapshot.slots}
      />,
    );

    expect(html).toMatch(
      /aria-label="[^"]*at [^"]*2 matches[^"]*stale calendar data/,
    );
  });

  it("includes the slot start time in the aria-label for screen-reader disambiguation", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
        weekStart={new Date(snapshot.dateRangeStart)}
        weekEnd={new Date(snapshot.dateRangeEnd)}
        slots={snapshot.slots}
      />,
    );

    // startUtc 2026-07-15T10:00:00Z is 06:00 in America/New_York (EDT, UTC-4)
    expect(html).toMatch(/aria-label="[^"]*at 6:00 AM[^"]*2 matches/);
  });

  it("renders exactly seven day headers across the fall DST boundary", () => {
    const dstWeekStart = new Date("2026-10-26T04:00:00.000Z");
    const dstWeekEnd = addCivilDays(dstWeekStart, 7, "America/New_York");
    const html = renderToString(
      <SearchResultClient
        snapshot={{
          ...snapshot,
          dateRangeStart: dstWeekStart.toISOString(),
          dateRangeEnd: dstWeekEnd.toISOString(),
          slots: [],
        }}
        organizerTimezone="America/New_York"
        weekStart={dstWeekStart}
        weekEnd={dstWeekEnd}
        slots={[]}
      />,
    );

    expect(html.match(/role="columnheader"/g)).toHaveLength(7);
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
        weekStart={new Date(staleSnapshot.dateRangeStart)}
        weekEnd={new Date(staleSnapshot.dateRangeEnd)}
        slots={staleSnapshot.slots}
      />,
    );

    expect(html).toMatch(/slot-stale-indicator[^>]*aria-hidden="true"/);
  });

  it("does not expose email addresses in rendered output", () => {
    const html = renderToString(
      <SearchResultClient
        snapshot={snapshot}
        organizerTimezone="America/New_York"
        weekStart={new Date(snapshot.dateRangeStart)}
        weekEnd={new Date(snapshot.dateRangeEnd)}
        slots={snapshot.slots}
      />,
    );

    expect(html).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  });
});
