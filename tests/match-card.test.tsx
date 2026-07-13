import { describe, expect, it } from "vitest";

import { MatchCard } from "../app/components/MatchCard";
import type { SlotMatchDetail } from "../src/db/schema";

describe("MatchCard", () => {
  const availableMatch: SlotMatchDetail = {
    userId: "user-1",
    displayName: "Ada Lovelace",
    avatarUrl: "https://example.com/avatar.png",
    shortBio: "Computing pioneer",
    topics: [
      { id: "topic-1", name: "Compilers" },
      { id: "topic-2", name: "Type Theory" },
    ],
    availabilityIndicator: "available",
    calendarFreshness: "fresh",
  };

  const partialMatch: SlotMatchDetail = {
    userId: "user-2",
    displayName: null,
    avatarUrl: null,
    shortBio: null,
    topics: [{ id: "topic-3", name: "Parsing" }],
    availabilityIndicator: "partial",
    calendarFreshness: "stale",
  };

  const unavailableMatch: SlotMatchDetail = {
    userId: "user-3",
    displayName: "Grace Hopper",
    avatarUrl: null,
    shortBio: "COBOL pioneer",
    topics: [],
    availabilityIndicator: "unavailable",
    calendarFreshness: "none",
  };

  it("renders displayName", () => {
    const card = MatchCard({ match: availableMatch });
    const nameSpan = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-name",
    );
    expect(nameSpan?.props.children).toBe("Ada Lovelace");
  });

  it("renders Anonymous when displayName is null", () => {
    const card = MatchCard({ match: partialMatch });
    const nameSpan = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-name",
    );
    expect(nameSpan?.props.children).toBe("Anonymous");
  });

  it("renders avatar from avatarUrl", () => {
    const card = MatchCard({ match: availableMatch });
    const img = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-avatar",
    );
    expect(img?.props.src).toBe("https://example.com/avatar.png");
  });

  it("renders shortBio", () => {
    const card = MatchCard({ match: availableMatch });
    const bio = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-bio",
    );
    expect(bio?.props.children).toBe("Computing pioneer");
  });

  it("renders empty bio when shortBio is null", () => {
    const card = MatchCard({ match: partialMatch });
    const bio = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-bio",
    );
    expect(bio?.props.children).toBe("");
  });

  it("renders topics as comma-separated names", () => {
    const card = MatchCard({ match: availableMatch });
    const topics = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-topics",
    );
    expect(topics?.props.children).toContain("Compilers");
    expect(topics?.props.children).toContain("Type Theory");
  });

  it("renders availability text for available indicator", () => {
    const card = MatchCard({ match: availableMatch });
    const availability = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-availability",
    );
    expect(availability?.props.children).toContain(
      "available in this Search window",
    );
  });

  it("renders availability text for partial indicator", () => {
    const card = MatchCard({ match: partialMatch });
    const availability = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-availability",
    );
    expect(availability?.props.children).toContain(
      "partially available in this Search window",
    );
  });

  it("renders availability text for unavailable indicator", () => {
    const card = MatchCard({ match: unavailableMatch });
    const availability = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-availability",
    );
    expect(availability?.props.children).toContain("manual only");
  });

  it("renders calendar freshness label as fresh", () => {
    const card = MatchCard({ match: availableMatch });
    const calendar = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-calendar",
    );
    const badge = calendar?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "calendar-fresh",
    );
    expect(badge?.props.children).toBe("fresh");
  });

  it("renders calendar freshness label as stale", () => {
    const card = MatchCard({ match: partialMatch });
    const calendar = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-calendar",
    );
    const badge = calendar?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "calendar-stale",
    );
    expect(badge?.props.children).toBe("stale");
  });

  it("renders calendar freshness label as no calendar connected", () => {
    const card = MatchCard({ match: unavailableMatch });
    const calendar = card.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "match-card-calendar",
    );
    const badge = calendar?.props.children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "props" in child &&
        child.props.className === "calendar-none",
    );
    expect(badge?.props.children).toBe("no calendar connected");
  });
});
