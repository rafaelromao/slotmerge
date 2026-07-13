"use client";

import { useEffect } from "react";
import type { Slot, SearchSnapshot } from "../../src/db/schema";
import { MatchCard } from "./MatchCard";

export type SlotDetailsDrawerProps = {
  slot: Slot;
  snapshot: SearchSnapshot;
  onClose: () => void;
};

function formatSlotTime(
  startUtc: string,
  durationMinutes: number,
  timezone: string,
): string {
  const start = new Date(startUtc);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  });

  const startParts = formatter.formatToParts(start);
  const endTimeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  const startFormatted = startParts
    .map((p) => {
      if (p.type === "weekday") return `${p.value},`;
      if (p.type === "literal") return p.value;
      return p.value;
    })
    .join(" ")
    .replace(/,/g, ",");

  return `${startFormatted} - ${endTimeFormatter.format(end)} ${startFormatted.split(" ").pop()}`;
}

function getMatchedTopics(slots: Slot[]): string {
  const topicNames = new Set<string>();
  for (const slot of slots) {
    for (const match of slot.matches) {
      for (const topic of match.topics) {
        topicNames.add(topic.name);
      }
    }
  }
  return Array.from(topicNames).join(", ");
}

export function SlotDetailsDrawer({
  slot,
  snapshot,
  onClose,
}: SlotDetailsDrawerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const matchedTopics = getMatchedTopics(snapshot.slots);
  const slotTime = formatSlotTime(
    slot.startUtc,
    snapshot.durationMinutes,
    snapshot.organizerTimezone,
  );

  return (
    <div
      className="slot-details-drawer-overlay"
      onClick={onClose}
      data-testid="slot-details-drawer-overlay"
    >
      <div
        className="slot-details-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        data-testid="slot-details-drawer"
      >
        <div className="drawer-header">
          <h2 id="drawer-title" className="drawer-title">
            {slotTime}
          </h2>
          <p className="drawer-match-count">
            {slot.matchCount} matching{" "}
            {slot.matchCount === 1 ? "User" : "Users"}
          </p>
          {matchedTopics && (
            <p className="drawer-matched-topics">
              <strong>Matched Topics:</strong> {matchedTopics}
            </p>
          )}
        </div>

        <div className="drawer-participants">
          <h3 className="drawer-section-title">Participants</h3>
          <div className="drawer-match-list">
            {slot.matches.map((match, index) => (
              <div key={match.userId} className="drawer-match-item">
                <span className="match-index">{index + 1}.</span>
                <MatchCard match={match} />
              </div>
            ))}
          </div>
        </div>

        <div className="drawer-footer">
          <p className="drawer-no-actions">
            No booking actions in MVP.
            <br />
            No export/share actions in MVP.
          </p>
        </div>
      </div>
    </div>
  );
}
