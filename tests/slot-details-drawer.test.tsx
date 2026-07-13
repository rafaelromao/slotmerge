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
        availabilityIndicator: "available",
        calendarFreshness: "fresh",
      },
      {
        userId: "user-2",
        displayName: "Grace Hopper",
        avatarUrl: null,
        shortBio: "COBOL pioneer",
        topics: [{ id: "topic-2", name: "Programming Languages" }],
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

  it("renders slot time in organizer timezone", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const header = drawer.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-header",
    );
    const title = header?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-title",
    );
    expect(title?.props.children).toBeTruthy();
    expect(title?.props.children).toContain("2026");
  });

  it("renders match count", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const header = drawer.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-header",
    );
    const matchCount = header?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-match-count",
    );
    expect(matchCount?.props.children).toContain("2");
    expect(matchCount?.props.children).toContain("matching");
    expect(matchCount?.props.children).toContain("Users");
  });

  it("renders matched topics from selected slot only", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const header = drawer.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-header",
    );
    const topics = header?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-matched-topics",
    );
    expect(topics?.props.children).toContain("Compilers");
    expect(topics?.props.children).toContain("Programming Languages");
  });

  it("renders all matches in participants section", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const participants = drawer.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-participants",
    );
    const matchList = participants?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-match-list",
    );
    expect(matchList?.props.children.length).toBe(2);
  });

  it("renders footer with no-actions message", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const footer = drawer.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-footer",
    );
    const noActions = footer?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-no-actions",
    );
    expect(noActions?.props.children).toContain("No booking actions");
    expect(noActions?.props.children).toContain("No export/share actions");
  });

  it("has no button, form, or anchor elements (read-only)", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    function countActionElements(node: unknown): number {
      if (!node || typeof node !== "object") return 0;
      const element = node as { type?: string; props?: { children?: unknown } };
      if (element.type === "button" || element.type === "form" || element.type === "a") {
        return 1;
      }
      let count = 0;
      if (element.props?.children) {
        const children = Array.isArray(element.props.children)
          ? element.props.children
          : [element.props.children];
        for (const child of children) {
          count += countActionElements(child);
        }
      }
      return count;
    }

    expect(countActionElements(drawer)).toBe(0);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const overlay = drawer.props.children;
    expect(overlay?.props.className).toBe("slot-details-drawer-overlay");
    overlay?.props.onClick();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when drawer inner is clicked (not backdrop)", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const overlay = drawer.props.children;
    const inner = overlay?.props.children;
    inner?.props.onClick({ stopPropagation: vi.fn() });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies data-testid attributes for testid matching", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const overlay = drawer.props.children;
    expect(overlay?.props["data-testid"]).toBe("slot-details-drawer-overlay");

    const inner = overlay?.props.children;
    expect(inner?.props["data-testid"]).toBe("slot-details-drawer");
  });

  it("renders role=dialog and aria attributes for accessibility", () => {
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ slot, snapshot, onClose });

    const overlay = drawer.props.children;
    const inner = overlay?.props.children;
    expect(inner?.props.role).toBe("dialog");
    expect(inner?.props["aria-modal"]).toBe("true");
    expect(inner?.props["aria-labelledby"]).toBe("drawer-title");
  });

  it("renders slot with zero matches gracefully", () => {
    const emptySlot: Slot = {
      startUtc: "2026-07-15T10:00:00Z",
      matchCount: 0,
      matches: [],
    };
    const onClose = vi.fn();
    const drawer = SlotDetailsDrawer({ emptySlot, snapshot, onClose });

    const header = drawer.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-header",
    );
    const matchCount = header?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "drawer-match-count",
    );
    expect(matchCount?.props.children).toContain("0");
    expect(matchCount?.props.children).toContain("matching");
  });
});
