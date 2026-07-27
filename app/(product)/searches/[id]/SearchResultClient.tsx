"use client";

import { useCallback, useMemo, useState } from "react";
import { SlotDetailsDrawer } from "../../../components/SlotDetailsDrawer";
import type { Slot, SearchSnapshot } from "../../../../src/db/schema";
import { addCivilDays } from "../../../../src/search/timezone";

type WeeklyDay = {
  date: Date;
  label: string;
};

type WeeklyHourRow = {
  hour: number;
  label: string;
  cells: Array<Slot | null>;
};

function buildWeeklyGrid(
  weekStart: Date,
  weekEnd: Date,
  slots: Slot[],
  timezone: string,
  formatters: {
    dayFormatter: Intl.DateTimeFormat;
    dayKeyFormatter: Intl.DateTimeFormat;
    hourFormatter: Intl.DateTimeFormat;
    hourKeyFormatter: Intl.DateTimeFormat;
  },
): { days: WeeklyDay[]; hourRows: WeeklyHourRow[] } {
  const days: WeeklyDay[] = [];
  const dayKeys: string[] = [];

  for (
    let d = new Date(weekStart);
    d < weekEnd;
    d = addCivilDays(d, 1, timezone)
  ) {
    const dayDate = new Date(d);
    const dayKey = formatters.dayKeyFormatter.format(dayDate);

    days.push({
      date: dayDate,
      label: formatters.dayFormatter.format(dayDate),
    });
    dayKeys.push(dayKey);
  }

  const slotMap = new Map<string, Slot>();
  for (const slot of slots) {
    const slotDate = new Date(slot.startUtc);
    const dayKey = formatters.dayKeyFormatter.format(slotDate);
    const hourKey = formatters.hourKeyFormatter.format(slotDate);
    slotMap.set(`${dayKey}:${hourKey}`, slot);
  }

  const hourRows = Array.from({ length: 24 }, (_, hour) => {
    const rowDate = new Date(weekStart.getTime() + hour * 60 * 60 * 1000);
    const hourKey = String(hour).padStart(2, "0");
    return {
      hour,
      label: formatters.hourFormatter.format(rowDate),
      cells: dayKeys.map(
        (dayKey) => slotMap.get(`${dayKey}:${hourKey}`) ?? null,
      ),
    };
  });

  return { days, hourRows };
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
  weekStart,
  weekEnd,
  slots,
}: {
  snapshot: SearchSnapshot;
  organizerTimezone: string;
  weekStart: Date;
  weekEnd: Date;
  slots: Slot[];
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
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      hourFormatter: new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: organizerTimezone,
      }),
      hourKeyFormatter: new Intl.DateTimeFormat("en-CA", {
        timeZone: organizerTimezone,
        hour: "2-digit",
        hourCycle: "h23",
      }),
    };
  }, [organizerTimezone]);

  const { days, hourRows } = useMemo(
    () =>
      buildWeeklyGrid(weekStart, weekEnd, slots, organizerTimezone, formatters),
    [weekEnd, weekStart, slots, organizerTimezone, formatters],
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
        aria-label={`Weekly search results, ${days.length} day${days.length !== 1 ? "s" : ""} by ${hourRows.length} hourly rows`}
      >
        <div className="calendar-header" role="row">
          <div className="calendar-hour-corner" aria-hidden="true" />
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

        <div className="calendar-body">
          {hourRows.map((row) => (
            <div key={`r-${row.hour}`} className="calendar-hour-row" role="row">
              <div className="calendar-hour-label" role="rowheader">
                {row.label}
              </div>
              {row.cells.map((slot, dayIdx) => {
                if (!slot) {
                  return (
                    <div
                      key={`c-${dayIdx}`}
                      className="calendar-hour-cell"
                      aria-hidden="true"
                    />
                  );
                }

                const isStale = slotHasStale(slot);
                return (
                  <div key={`c-${dayIdx}`} className="calendar-hour-cell">
                    <button
                      type="button"
                      className="calendar-slot"
                      data-testid={`slot-${dayIdx}-${row.hour}`}
                      data-stale={isStale ? "true" : "false"}
                      aria-label={buildSlotLabel(
                        slot,
                        days[dayIdx]?.label ?? "",
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
                  </div>
                );
              })}
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
