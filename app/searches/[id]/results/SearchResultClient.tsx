"use client";

import { useState } from "react";
import { SlotDetailsDrawer } from "../../../components/SlotDetailsDrawer";
import type { Slot, SearchSnapshot } from "../../../../src/db/schema";
import { getLocalDateParts } from "../../../../src/time/local-time";

type WeeklyDay = {
  date: Date;
  label: string;
  slots: Slot[];
};

function formatDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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
    const localParts = getLocalDateParts(dayDate, timezone);
    const dayKey = formatDayKey(
      localParts.year,
      localParts.month,
      localParts.day,
    );
    const daySlots = snapshot.slots.filter((slot) => {
      const slotDate = new Date(slot.startUtc);
      const slotParts = getLocalDateParts(slotDate, timezone);
      return (
        formatDayKey(slotParts.year, slotParts.month, slotParts.day) === dayKey
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

export function SearchResultClient({
  snapshot,
  organizerTimezone,
}: {
  snapshot: SearchSnapshot;
  organizerTimezone: string;
}) {
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const days = buildWeeklyGrid(snapshot, organizerTimezone);

  return (
    <main className="search-result-page">
      <h1>Search Result</h1>
      <p>
        {organizerTimezone} &middot; {days.length} day
        {days.length !== 1 ? "s" : ""}
      </p>

      <div
        className="calendar-grid"
        style={{ "--day-count": days.length } as React.CSSProperties}
      >
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

      {selectedSlot && (
        <SlotDetailsDrawer
          slot={selectedSlot}
          snapshot={snapshot}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </main>
  );
}
