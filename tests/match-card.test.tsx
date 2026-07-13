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
    topicProfile: [
      { id: "topic-1", name: "Compilers" },
      { id: "topic-2", name: "Type Theory" },
      { id: "topic-3", name: "Parsing" },
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
    topicProfile: [{ id: "topic-3", name: "Parsing" }],
    availabilityIndicator: "partial",
    calendarFreshness: "stale",
  };

  const unavailableMatch: SlotMatchDetail = {
    userId: "user-3",
    displayName: "Grace Hopper",
    avatarUrl: null,
    shortBio: "COBOL pioneer",
    topics: [],
    topicProfile: [],
    availabilityIndicator: "unavailable",
    calendarFreshness: "none",
  };

  it("renders with data-testid match-card", () => {
    const card = MatchCard({ match: availableMatch });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(card.props["data-testid"]).toBe("match-card");
  });

  it("renders displayName or Anonymous", () => {
    const card = MatchCard({ match: availableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("Ada Lovelace");
  });

  it("renders Anonymous when displayName is null", () => {
    const card = MatchCard({ match: partialMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("Anonymous");
  });

  it("renders avatar from avatarUrl", () => {
    const card = MatchCard({ match: availableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("https://example.com/avatar.png");
  });

  it("renders shortBio", () => {
    const card = MatchCard({ match: availableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("Computing pioneer");
  });

  it("renders empty bio when shortBio is null", () => {
    const card = MatchCard({ match: partialMatch });
    const json = JSON.stringify(card);
    expect(json).not.toContain("Computing pioneer");
  });

  it("renders topics as comma-separated names", () => {
    const card = MatchCard({ match: availableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("Compilers");
    expect(json).toContain("Type Theory");
  });

  it("renders availability text for available indicator", () => {
    const card = MatchCard({ match: availableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("available in this Search window");
  });

  it("renders availability text for partial indicator", () => {
    const card = MatchCard({ match: partialMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("partially available in this Search window");
  });

  it("renders availability text for unavailable indicator", () => {
    const card = MatchCard({ match: unavailableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("manual only");
  });

  it("renders calendar freshness label as fresh", () => {
    const card = MatchCard({ match: availableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain('"label":"fresh"');
    expect(json).toContain('"className":"calendar-fresh"');
  });

  it("renders calendar freshness label as stale", () => {
    const card = MatchCard({ match: partialMatch });
    const json = JSON.stringify(card);
    expect(json).toContain('"label":"stale"');
    expect(json).toContain('"className":"calendar-stale"');
  });

  it("renders calendar freshness label as no calendar connected", () => {
    const card = MatchCard({ match: unavailableMatch });
    const json = JSON.stringify(card);
    expect(json).toContain("no calendar connected");
    expect(json).toContain('"className":"calendar-none"');
  });
});
