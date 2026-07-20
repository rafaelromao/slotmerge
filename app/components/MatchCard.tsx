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

function getInitials(displayName: string | null): string {
  const name = displayName ?? "Anonymous";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MatchCard({ match }: MatchCardProps) {
  const displayName = match.displayName ?? "Anonymous";
  const initials = getInitials(match.displayName);
  const avatarAlt = match.displayName
    ? `${displayName}'s avatar`
    : "Profile avatar";
  const bio = match.shortBio ?? "";
  const topicNames = match.topicProfile.map((t) => t.name).join(", ");
  const availabilityText = getAvailabilityText(match.availabilityIndicator);
  const calendar = getCalendarText(match.calendarFreshness);

  return (
    <article className="match-card" data-testid="match-card">
      <header className="match-card-header">
        {match.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-provided avatarUrl; optimization deferred
          <img
            src={match.avatarUrl}
            alt={avatarAlt}
            className="match-card-avatar"
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="match-card-avatar" aria-hidden="true">
            {initials}
          </span>
        )}
        <h3 className="match-card-name">{displayName}</h3>
      </header>
      {bio && <p className="match-card-bio">{bio}</p>}
      <dl className="match-card-meta">
        <div className="match-card-meta-row">
          <dt className="match-card-meta-label">Topics</dt>
          <dd className="match-card-meta-value">{topicNames}</dd>
        </div>
        <div className="match-card-meta-row">
          <dt className="match-card-meta-label">Availability</dt>
          <dd className="match-card-meta-value">{availabilityText}</dd>
        </div>
        <div className="match-card-meta-row">
          <dt className="match-card-meta-label">Calendar</dt>
          <dd className="match-card-meta-value">
            <span className={calendar.className}>{calendar.label}</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}
