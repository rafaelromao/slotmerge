"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Slot, SearchSnapshot } from "../../src/db/schema";
import { MatchCard } from "./MatchCard";

export type SlotDetailsDrawerProps = {
  slot: Slot;
  snapshot: SearchSnapshot;
  onClose: () => void;
};

const TITLE_ID = "drawer-title";
const DESCRIPTION_ID = "drawer-description";

function formatSlotTime(
  startUtc: string,
  durationMinutes: number,
  timezone: string,
  formatters: {
    startFormatter: Intl.DateTimeFormat;
    endTimeFormatter: Intl.DateTimeFormat;
  },
): string {
  const start = new Date(startUtc);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const startParts = formatters.startFormatter.formatToParts(start);
  const startFormatted = startParts
    .map((p) => {
      if (p.type === "weekday") return `${p.value},`;
      if (p.type === "literal") return p.value;
      return p.value;
    })
    .join(" ")
    .replace(/,/g, ",");

  return `${startFormatted} - ${formatters.endTimeFormatter.format(end)} ${startFormatted.split(" ").pop()}`;
}

function getSlotMatchedTopics(matches: Slot["matches"]): string {
  const topicNames = new Set<string>();
  for (const match of matches) {
    for (const topic of match.topics) {
      topicNames.add(topic.name);
    }
  }
  return Array.from(topicNames).join(", ");
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("aria-hidden"),
  );
}

export function SlotDetailsDrawer({
  slot,
  snapshot,
  onClose,
}: SlotDetailsDrawerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const formatters = useMemo(() => {
    return {
      startFormatter: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: snapshot.organizerTimezone,
        timeZoneName: "short",
      }),
      endTimeFormatter: new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: snapshot.organizerTimezone,
      }),
    };
  }, [snapshot.organizerTimezone]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = "hidden";

    const closeButton = closeButtonRef.current;
    if (closeButton) {
      closeButton.focus();
    }

    return () => {
      document.body.style.overflow = "";
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement) {
        previous.focus();
      }
    };
  }, []);

  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDialogClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const matchedTopics = getSlotMatchedTopics(slot.matches);
  const slotTime = formatSlotTime(
    slot.startUtc,
    snapshot.durationMinutes,
    snapshot.organizerTimezone,
    formatters,
  );

  const matchCountText = `${slot.matchCount} matching ${slot.matchCount === 1 ? "User" : "Users"}`;

  return (
    <div
      className="slot-details-drawer-overlay"
      onClick={handleOverlayClick}
      data-testid="slot-details-drawer-overlay"
    >
      <div
        ref={dialogRef}
        className="slot-details-drawer"
        onClick={handleDialogClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESCRIPTION_ID}
        data-testid="slot-details-drawer"
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="drawer-close"
          onClick={onClose}
          aria-label="Close slot details"
          data-testid="drawer-close"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="drawer-header">
          <h2 id={TITLE_ID} className="drawer-title">
            {slotTime}
          </h2>
          <p id={DESCRIPTION_ID} className="drawer-match-count">
            {matchCountText}
          </p>
          {matchedTopics && (
            <p className="drawer-matched-topics">
              <span className="drawer-matched-topics-label">
                Matched Topics:
              </span>{" "}
              {matchedTopics}
            </p>
          )}
        </div>

        <div className="drawer-participants">
          <h3 className="drawer-section-title">Participants</h3>
          <ul className="drawer-match-list">
            {slot.matches.map((match, index) => (
              <li key={match.userId} className="drawer-match-item">
                <span className="match-index" aria-hidden="true">
                  {index + 1}.
                </span>
                <MatchCard match={match} />
              </li>
            ))}
          </ul>
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
