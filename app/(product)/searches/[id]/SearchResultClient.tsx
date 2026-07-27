"use client";

import { useCallback, useMemo, useState } from "react";
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

  const handleSlotClick = useCallback((slot: Slot) => {
    setSelectedSlot(slot);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedSlot(null);
  }, []);

  return (
    <>
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
                      <span className="slot-count">{slot.matchCount}</span>
                      {isStale && (
                        <span
                          className="slot-stale-indicator"
                          aria-hidden="true"
                        >
                          <span className="slot-stale-glyph">⚠</span>
                        </span>
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
    </>
  );
}
