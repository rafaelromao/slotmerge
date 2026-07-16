import { describe, expect, it, vi } from "vitest";

import { SlotDetailsDrawer } from "../app/components/SlotDetailsDrawer";
import type { SearchSnapshot, Slot } from "../src/db/schema";

describe("SlotDetailsDrawer", () => {
  const slot: Slot = {
    startUtc: "2026-07-15T10:00:00Z",
    matchCount: 2,
    matches: [
      {
        userId: "user-1",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: "Computing pioneer",
        topics: [{ id: "topic-1", name: "Compilers" }],
        topicProfile: [
          { id: "topic-1", name: "Compilers" },
          { id: "topic-3", name: "Parsing" },
        ],
        availabilityIndicator: "available",
        calendarFreshness: "fresh",
      },
      {
        userId: "user-2",
        displayName: "Grace Hopper",
        avatarUrl: null,
        shortBio: "COBOL pioneer",
        topics: [{ id: "topic-2", name: "Programming Languages" }],
        topicProfile: [
          { id: "topic-2", name: "Programming Languages" },
          { id: "topic-4", name: "Formal Languages" },
        ],
        availabilityIndicator: "partial",
        calendarFreshness: "stale",
      },
    ],
  };

  const snapshot: SearchSnapshot = {
    generatedAt: "2026-07-13T00:00:00Z",
    organizerTimezone: "America/New_York",
    dateRangeStart: "2026-07-13T00:00:00Z",
    dateRangeEnd: "2026-07-19T23:59:59Z",
    durationMinutes: 60,
    slots: [slot],
  };

  it("renders with data-testid on overlay", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("slot-details-drawer-overlay");
  });

  it("renders with data-testid on drawer", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("slot-details-drawer");
  });

  it("renders slot time (contains year 2026)", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("2026");
  });

  it("renders match count pluralized", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("2");
    expect(json).toContain("matching");
    expect(json).toContain("Users");
  });

  it("renders matched topics from selected slot only", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("Compilers");
    expect(json).toContain("Programming Languages");
  });

  it("renders both participants", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("Ada Lovelace");
    expect(json).toContain("Grace Hopper");
  });

  it("renders footer with no-actions message", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("No booking actions");
    expect(json).toContain("No export/share actions");
  });

  it("has no button, form, or anchor elements (read-only)", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).not.toContain('"type":"button"');
    expect(json).not.toContain('"type":"form"');
    expect(json).not.toContain('"type":"a"');
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const overlay = drawer.props.children;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    overlay.props.onClick();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders role=dialog for accessibility", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain('"role":"dialog"');
    expect(json).toContain('"aria-modal":true');
    expect(json).toContain('"aria-labelledby":"drawer-title"');
  });

  it("renders slot with zero matches gracefully", () => {
    const emptySlot: Slot = {
      startUtc: "2026-07-15T10:00:00Z",
      matchCount: 0,
      matches: [],
    };
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot: emptySlot, snapshot, onClose });
    const json = JSON.stringify(drawer);
    expect(json).toContain("0");
    expect(json).toContain("matching");
  });

  it("does not expose email addresses in rendered output", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });
    const json = JSON.stringify(drawer);

    expect(json).not.toMatch(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    );
  });
});
