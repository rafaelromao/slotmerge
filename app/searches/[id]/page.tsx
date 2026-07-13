"use client";

import { useCallback, useEffect, useState } from "react";
import type { SearchSnapshot, Slot } from "../../../src/db/schema";
import {
  alignToMonday,
  getNextWeekStart,
  getPreviousWeekStart,
  getSlotsForWeek,
  slotHasStaleMatch,
} from "../../../src/search/calendar-utils";

type SearchDetail = {
  id: string;
  organizerId: string;
  selectedTopicIds: string[];
  minimumMatchingUsers: number;
  durationMinutes: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  organizerTimezone: string;
  generatedAt: string;
  snapshot: SearchSnapshot | null;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SearchResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [search, setSearch] = useState<SearchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date | null>(null);
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(
    null,
  );

  useEffect(() => {
    void params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams) return;

    const searchId = resolvedParams.id;

    async function fetchSearch() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/searches/${searchId}`);
        if (!res.ok) {
          if (res.status === 403) {
            setError("You do not have permission to view this search result.");
          } else if (res.status === 404) {
            setError("Search result not found.");
          } else {
            setError("Failed to load search result.");
          }
          return;
        }
        const data: SearchDetail = (await res.json()) as SearchDetail;
        setSearch(data);

        if (data.snapshot && data.organizerTimezone) {
          const initialWeekStart = alignToMonday(
            new Date(data.dateRangeStart),
            data.organizerTimezone,
          );
          setCurrentWeekStart(initialWeekStart);
        }
      } catch {
        setError("Failed to load search result.");
      } finally {
        setLoading(false);
      }
    }

    void fetchSearch();
  }, [resolvedParams]);

  const handlePreviousWeek = useCallback(() => {
    if (!currentWeekStart || !search) return;
    const today = new Date();
    const prev = getPreviousWeekStart(currentWeekStart, today);
    if (prev) {
      setCurrentWeekStart(prev);
    }
  }, [currentWeekStart, search]);

  const handleNextWeek = useCallback(() => {
    if (!currentWeekStart || !search) return;
    const prev = getNextWeekStart(
      currentWeekStart,
      new Date(search.dateRangeEnd),
    );
    if (prev) {
      setCurrentWeekStart(prev);
    }
  }, [currentWeekStart, search]);

  const canGoPrevious = useCallback(() => {
    if (!currentWeekStart) return false;
    const today = new Date();
    return getPreviousWeekStart(currentWeekStart, today) !== null;
  }, [currentWeekStart]);

  const canGoNext = useCallback(() => {
    if (!currentWeekStart || !search) return false;
    return (
      getNextWeekStart(currentWeekStart, new Date(search.dateRangeEnd)) !== null
    );
  }, [currentWeekStart, search]);

  if (loading) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }

  if (error || !search) {
    return (
      <main>
        <p>{error ?? "Search not found."}</p>
      </main>
    );
  }

  if (!search.snapshot) {
    return (
      <main>
        <p>Search result snapshot not available.</p>
      </main>
    );
  }

  const slotsForWeek = currentWeekStart
    ? getSlotsForWeek(search.snapshot, currentWeekStart)
    : [];

  const slotsByDayHour = buildGrid(slotsForWeek, search.organizerTimezone);

  const weekEnd = currentWeekStart
    ? new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <main>
      <h1>Search Result</h1>
      <p>Generated: {new Date(search.generatedAt).toLocaleString()}</p>
      <p>
        Range: {new Date(search.dateRangeStart).toLocaleDateString()} -{" "}
        {new Date(search.dateRangeEnd).toLocaleDateString()}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          margin: "1rem 0",
        }}
      >
        <button onClick={handlePreviousWeek} disabled={!canGoPrevious()}>
          Previous Week
        </button>
        {currentWeekStart && weekEnd && (
          <span>
            {formatDate(currentWeekStart)} - {formatDate(weekEnd)}
          </span>
        )}
        <button onClick={handleNextWeek} disabled={!canGoNext()}>
          Next Week
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px repeat(7, 1fr)",
          gap: "2px",
          border: "1px solid #ccc",
          padding: "4px",
        }}
      >
        <div></div>
        {DAYS.map((day) => (
          <div
            key={day}
            style={{
              fontWeight: "bold",
              textAlign: "center",
              borderBottom: "1px solid #ccc",
              padding: "4px",
            }}
          >
            {day}
          </div>
        ))}

        {HOURS.map((hour) => (
          <>
            <div
              key={`time-${hour}`}
              style={{
                fontSize: "0.75rem",
                color: "#666",
                padding: "2px",
              }}
            >
              {String(hour).padStart(2, "0")}:00
            </div>
            {DAYS.map((_, dayIndex) => {
              const slot = slotsByDayHour.get(`${dayIndex}-${hour}`);
              return (
                <div
                  key={`${dayIndex}-${hour}`}
                  style={{
                    border: "1px solid #eee",
                    padding: "4px",
                    minHeight: "40px",
                    textAlign: "center",
                    position: "relative",
                    backgroundColor: slot?.hasStale ? "#fff3cd" : "#fff",
                  }}
                >
                  {slot && slot.matchCount > 0 && (
                    <>
                      <span>{slot.matchCount}</span>
                      {slot.hasStale && (
                        <span
                          title="Contains stale calendar data"
                          style={{ color: "#d9534f", marginLeft: "4px" }}
                        >
                          ⚠
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </main>
  );
}

function buildGrid(
  slots: Slot[],
  timezone: string,
): Map<string, { matchCount: number; hasStale: boolean }> {
  const map = new Map<string, { matchCount: number; hasStale: boolean }>();

  for (const slot of slots) {
    const date = new Date(slot.startUtc);
    const dayIndex = getDayIndexInTimezone(date, timezone);
    const hour = getHourInTimezone(date, timezone);
    const key = `${dayIndex}-${hour}`;

    map.set(key, {
      matchCount: slot.matchCount,
      hasStale: slotHasStaleMatch(slot),
    });
  }

  return map;
}

function getDayIndexInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const weekdayIndex =
    weekday === "Mon"
      ? 0
      : weekday === "Tue"
        ? 1
        : weekday === "Wed"
          ? 2
          : weekday === "Thu"
            ? 3
            : weekday === "Fri"
              ? 4
              : weekday === "Sat"
                ? 5
                : 6;
  return weekdayIndex;
}

function getHourInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(hourStr);
}
