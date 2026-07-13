"use client";

import { useState, useEffect } from "react";
import { SlotDetailsDrawer } from "../../../components/SlotDetailsDrawer";
import type { Slot, SearchSnapshot } from "../../../../src/db/schema";

type SearchResult = {
  search: {
    id: string;
    organizerId: string;
    selectedTopicIds: string[];
    minimumMatchingUsers: number;
    durationMinutes: number;
    dateRangeStart: string;
    dateRangeEnd: string;
    organizerTimezone: string;
    generatedAt: string;
  };
  snapshot: SearchSnapshot | null;
};

type WeeklyDay = {
  date: Date;
  label: string;
  slots: Slot[];
};

function buildWeeklyGrid(
  snapshot: SearchSnapshot,
  timezone: string,
): WeeklyDay[] {
  const start = new Date(snapshot.dateRangeStart);
  const end = new Date(snapshot.dateRangeEnd);
  const days: WeeklyDay[] = [];

  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayDate = new Date(d);
    const daySlots = snapshot.slots.filter((slot) => {
      const slotDate = new Date(slot.startUtc);
      return (
        slotDate.getFullYear() === dayDate.getFullYear() &&
        slotDate.getMonth() === dayDate.getMonth() &&
        slotDate.getDate() === dayDate.getDate()
      );
    });

    days.push({
      date: new Date(dayDate),
      label: dayFormatter.format(dayDate),
      slots: daySlots,
    });
  }

  return days;
}

export default function SearchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [searchId, setSearchId] = useState<string | null>(null);
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  useEffect(() => {
    void params.then(({ id }) => setSearchId(id));
  }, [params]);

  useEffect(() => {
    if (!searchId) return;

    async function fetchSearch() {
      try {
        const res = await fetch(`/api/searches/${searchId}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as SearchResult;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    void fetchSearch();
  }, [searchId]);

  if (loading) {
    return (
      <main>
        <p>Loading search result...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main>
        <p>Error loading search result: {error ?? "not found"}</p>
      </main>
    );
  }

  const { snapshot } = data;

  if (!snapshot) {
    return (
      <main>
        <p>No snapshot available for this search.</p>
      </main>
    );
  }

  const days = buildWeeklyGrid(snapshot, snapshot.organizerTimezone);

  return (
    <main className="search-result-page">
      <h1>Search Result</h1>
      <p>
        {snapshot.organizerTimezone} &middot; {days.length} day
        {days.length !== 1 ? "s" : ""}
      </p>

      <div className="calendar-grid">
        <div className="calendar-header">
          {days.map((day, i) => (
            <div key={i} className="calendar-day-header">
              {day.label}
            </div>
          ))}
        </div>

        <div className="calendar-body">
          {days.map((day, dayIdx) => (
            <div key={dayIdx} className="calendar-day-column">
              {day.slots.length === 0 ? (
                <div className="calendar-slot-empty">—</div>
              ) : (
                day.slots.map((slot, slotIdx) => {
                  const hasStale = slot.matches.some(
                    (m) => m.calendarFreshness === "stale",
                  );
                  return (
                    <button
                      key={slotIdx}
                      className="calendar-slot"
                      data-testid={`slot-${dayIdx}-${slotIdx}`}
                      onClick={() => setSelectedSlot(slot)}
                      title={
                        hasStale
                          ? `${slot.matchCount} match${slot.matchCount !== 1 ? "es" : ""} (stale calendar data)`
                          : `${slot.matchCount} match${slot.matchCount !== 1 ? "es" : ""}`
                      }
                    >
                      {slot.matchCount === 0 ? (
                        <span className="slot-count slot-count-zero">—</span>
                      ) : (
                        <>
                          <span className="slot-count">
                            [{slot.matchCount}]
                          </span>
                          {hasStale && (
                            <span className="slot-stale-indicator">*</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedSlot && snapshot && (
        <SlotDetailsDrawer
          slot={selectedSlot}
          snapshot={snapshot}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </main>
  );
}
