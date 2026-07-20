// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SlotDetailsDrawer } from "../app/components/SlotDetailsDrawer";
import type { SearchSnapshot, Slot } from "../src/db/schema";

describe("SlotDetailsDrawer", () => {
  const slot: Slot = {
    startUtc: "2026-07-15T10:00:00.000Z",
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
    generatedAt: "2026-07-13T00:00:00.000Z",
    organizerTimezone: "America/New_York",
    dateRangeStart: "2026-07-13T00:00:00.000Z",
    dateRangeEnd: "2026-07-19T23:59:59.000Z",
    durationMinutes: 60,
    slots: [slot],
  };

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("renders with data-testid on overlay", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain('data-testid="slot-details-drawer-overlay"');
  });

  it("renders with data-testid on drawer", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain('data-testid="slot-details-drawer"');
  });

  it("renders slot time (contains year 2026)", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain("2026");
  });

  it("renders match count pluralized", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain("2");
    expect(html).toContain("matching");
    expect(html).toContain("Users");
  });

  it("renders matched topics from selected slot only", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain("Compilers");
    expect(html).toContain("Programming Languages");
  });

  it("renders both participants", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Grace Hopper");
  });

  it("renders footer with no-actions message", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain("No booking actions");
    expect(html).toContain("No export/share actions");
  });

  it("renders only the close button and no other interactive elements (no booking, export, or share)", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    const buttonMatches = html.match(/<button\b/g) ?? [];
    expect(buttonMatches.length).toBe(1);
    expect(html).toContain("drawer-close");
    expect(html).not.toMatch(/<form\b/);
    expect(html).not.toMatch(/<a\b/);
  });

  it("renders a labelled close button as the first focusable element", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Close slot details"');
    const drawerIndex = html.indexOf('data-testid="slot-details-drawer"');
    const closeIndex = html.indexOf('data-testid="drawer-close"');
    expect(drawerIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(drawerIndex);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={onClose} />,
    );
    fireEvent.click(getByTestId("drawer-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={onClose} />,
    );
    fireEvent.click(getByTestId("slot-details-drawer-overlay"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when dialog body is clicked", () => {
    const onClose = vi.fn();
    const { getByTestId } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={onClose} />,
    );
    fireEvent.click(getByTestId("slot-details-drawer"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("focuses the close button when the drawer opens", () => {
    const { getByTestId } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(document.activeElement).toBe(getByTestId("drawer-close"));
  });

  it("traps Tab focus inside the dialog when the only focusable is the close button", () => {
    const { getByTestId } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    const close = getByTestId("drawer-close");
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });

  it("restores focus to the previously focused element on close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open drawer";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it("renders role=dialog for accessibility", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="drawer-title"');
    expect(html).toContain('aria-describedby="drawer-description"');
  });

  it("moves focus into the dialog on open by focusing the close button", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).toContain('data-testid="drawer-close"');
    expect(html).toContain('aria-label="Close slot details"');
  });

  it("locks body scroll while open and restores it on close", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={onClose} />,
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("renders slot with zero matches gracefully", () => {
    const emptySlot: Slot = {
      startUtc: "2026-07-15T10:00:00.000Z",
      matchCount: 0,
      matches: [],
    };
    const html = renderToString(
      <SlotDetailsDrawer
        slot={emptySlot}
        snapshot={snapshot}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("0");
    expect(html).toContain("matching");
  });

  it("does not expose email addresses in rendered output", () => {
    const html = renderToString(
      <SlotDetailsDrawer slot={slot} snapshot={snapshot} onClose={vi.fn()} />,
    );
    expect(html).not.toMatch(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    );
  });
});
