"use client";

import type { SlotMatchDetail } from "../../src/db/schema";

type MatchCardProps = {
  match: SlotMatchDetail;
};

function getAvailabilityText(
  indicator: SlotMatchDetail["availabilityIndicator"],
): string {
  if (indicator === "available") {
    return "available in this Search window";
  }
  if (indicator === "partial") {
    return "partially available in this Search window";
  }
  return "manual only";
}

function getCalendarText(freshness: SlotMatchDetail["calendarFreshness"]): {
  label: string;
  className: string;
} {
  if (freshness === "fresh") {
    return { label: "fresh", className: "calendar-fresh" };
  }
  if (freshness === "stale") {
    return { label: "stale", className: "calendar-stale" };
  }
  return { label: "no calendar connected", className: "calendar-none" };
}

function getInitialsAvatar(displayName: string | null): string {
  const name = displayName ?? "Anonymous";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const encoded = encodeURIComponent(initials);
  return `https://ui-avatars.com/api/?name=${encoded}&background=random&size=80`;
}

export function MatchCard({ match }: MatchCardProps) {
  const displayName = match.displayName ?? "Anonymous";
  const avatarUrl = match.avatarUrl ?? getInitialsAvatar(match.displayName);
  const bio = match.shortBio ?? "";
  const topicNames = match.topics.map((t) => t.name).join(", ");
  const availabilityText = getAvailabilityText(match.availabilityIndicator);
  const calendar = getCalendarText(match.calendarFreshness);

  return (
    <div className="match-card" data-testid="match-card">
      <div className="match-card-header">
        <img
          src={avatarUrl}
          alt={`${displayName}'s avatar`}
          className="match-card-avatar"
          width={40}
          height={40}
        />
        <span className="match-card-name">{displayName}</span>
      </div>
      {bio && <p className="match-card-bio">{bio}</p>}
      <p className="match-card-topics">
        <strong>Topics:</strong> {topicNames}
      </p>
      <p className="match-card-availability">
        <strong>Availability:</strong> {availabilityText}
      </p>
      <p className="match-card-calendar">
        <strong>Calendar:</strong>{" "}
        <span className={calendar.className}>{calendar.label}</span>
      </p>
    </div>
  );
}
