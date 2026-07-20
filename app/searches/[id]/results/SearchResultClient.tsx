"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlotDetailsDrawer } from "../../../components/SlotDetailsDrawer";
import type { Slot, SearchSnapshot } from "../../../../src/db/schema";

type WeeklyDay = {
  date: Date;
  label: string;
  slots: Slot[];
};

function buildWeeklyGrid(
  snapshot: SearchSnapshot,
  formatters: {
    dayFormatter: Intl.DateTimeFormat;
    dayKeyFormatter: Intl.DateTimeFormat;
  },
): WeeklyDay[] {
  const start = new Date(snapshot.dateRangeStart);
  const end = new Date(snapshot.dateRangeEnd);
  const days: WeeklyDay[] = [];

  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayDate = new Date(d);
    const dayKey = formatters.dayKeyFormatter.format(dayDate);
    const daySlots = snapshot.slots.filter((slot) => {
      const slotDate = new Date(slot.startUtc);
      return formatters.dayKeyFormatter.format(slotDate) === dayKey;
    });

    days.push({
      date: dayDate,
      label: formatters.dayFormatter.format(dayDate),
      slots: daySlots,
    });
  }

  return days;
}

function slotHasStale(slot: Slot): boolean {
  return slot.matches.some((m) => m.calendarFreshness === "stale");
}

function buildSlotLabel(
  slot: Slot,
  dayLabel: string,
  hourFormatter: Intl.DateTimeFormat,
): string {
  const count = slot.matchCount;
  const matchesWord = count === 1 ? "match" : "matches";
  const hourLabel = hourFormatter.format(new Date(slot.startUtc));
  const base = `${dayLabel} at ${hourLabel}, ${count} ${matchesWord}`;
  return slotHasStale(slot) ? `${base}, contains stale calendar data` : base;
}

export function SearchResultClient({
  snapshot,
  organizerTimezone,
}: {
  snapshot: SearchSnapshot;
  organizerTimezone: string;
}) {
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [focusedDayIndex, setFocusedDayIndex] = useState(0);
  const dayColumnRefs = useRef<Array<HTMLDivElement | null>>([]);

  const formatters = useMemo(() => {
    return {
      dayFormatter: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: organizerTimezone,
      }),
      dayKeyFormatter: new Intl.DateTimeFormat("en-CA", {
        timeZone: organizerTimezone,
      }),
      generatedAtFormatter: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: organizerTimezone,
      }),
      hourFormatter: new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: organizerTimezone,
      }),
    };
  }, [organizerTimezone]);

  const days = useMemo(
    () => buildWeeklyGrid(snapshot, formatters),
    [snapshot, formatters],
  );

  useEffect(() => {
    const column = dayColumnRefs.current[focusedDayIndex];
    if (column) {
      column.scrollIntoView({
        behavior: "smooth",
        inline: "start",
        block: "nearest",
      });
    }
  }, [focusedDayIndex]);

  const handlePrevDay = useCallback(() => {
    setFocusedDayIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleNextDay = useCallback(() => {
    setFocusedDayIndex((i) => Math.min(days.length - 1, i + 1));
  }, [days.length]);

  const handleSlotClick = useCallback((slot: Slot) => {
    setSelectedSlot(slot);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSlot(null);
  }, []);

  const canPrev = focusedDayIndex > 0;
  const canNext = focusedDayIndex < days.length - 1;
  const focusedDay = days[focusedDayIndex];

  return (
    <main className="search-result-page">
      <h1>Search Result</h1>
      <p className="search-result-meta">
        <span className="search-result-meta-item">
          <span className="search-result-meta-label">Timezone:</span>
          <span>{organizerTimezone}</span>
        </span>
        <span className="search-result-meta-item">
          <span className="search-result-meta-label">Generated:</span>
          <time dateTime={snapshot.generatedAt}>
            {formatters.generatedAtFormatter.format(
              new Date(snapshot.generatedAt),
            )}
          </time>
        </span>
        <span className="search-result-meta-item">
          <span className="search-result-meta-label">Window:</span>
          <span>
            {days.length} day{days.length !== 1 ? "s" : ""}
          </span>
        </span>
      </p>

      <div className="calendar-day-nav" aria-label="Day navigation">
        <button
          type="button"
          className="calendar-day-nav-btn"
          onClick={handlePrevDay}
          disabled={!canPrev}
          aria-label="Previous day"
          data-testid="day-nav-prev"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="calendar-day-nav-label" aria-live="polite">
          {focusedDay ? focusedDay.label : ""}
        </span>
        <button
          type="button"
          className="calendar-day-nav-btn"
          onClick={handleNextDay}
          disabled={!canNext}
          aria-label="Next day"
          data-testid="day-nav-next"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div
        className="calendar-grid"
        role="grid"
        aria-label={`Weekly search results, ${days.length} day${days.length !== 1 ? "s" : ""}`}
      >
        <div className="calendar-header" role="row">
          {days.map((day, i) => (
            <div
              key={`h-${i}`}
              className="calendar-day-header"
              role="columnheader"
            >
              {day.label}
            </div>
          ))}
        </div>

        <div className="calendar-body" role="row">
          {days.map((day, dayIdx) => (
            <div
              key={`d-${dayIdx}`}
              ref={(el) => {
                dayColumnRefs.current[dayIdx] = el;
              }}
              className="calendar-day-column"
              role="gridcell"
              aria-label={day.label}
            >
              {day.slots.length === 0 ? (
                <div className="calendar-slot-empty" aria-hidden="true">
                  —
                </div>
              ) : (
                day.slots.map((slot, slotIdx) => {
                  const isStale = slotHasStale(slot);
                  return (
                    <button
                      key={`s-${dayIdx}-${slotIdx}`}
                      type="button"
                      className="calendar-slot"
                      data-testid={`slot-${dayIdx}-${slotIdx}`}
                      data-stale={isStale ? "true" : "false"}
                      aria-label={buildSlotLabel(
                        slot,
                        day.label,
                        formatters.hourFormatter,
                      )}
                      onClick={() => handleSlotClick(slot)}
                    >
                      {slot.matchCount === 0 ? (
                        <span className="slot-count slot-count-zero">0</span>
                      ) : (
                        <>
                          <span className="slot-count">{slot.matchCount}</span>
                          {isStale && (
                            <span
                              className="slot-stale-indicator"
                              aria-hidden="true"
                            >
                              <span className="slot-stale-glyph" />
                            </span>
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
          onClose={handleClose}
        />
      )}
    </main>
  );
}
