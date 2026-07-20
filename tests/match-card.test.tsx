// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
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
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain('data-testid="match-card"');
  });

  it("renders displayName", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("Ada Lovelace");
  });

  it("renders Anonymous when displayName is null", () => {
    const html = renderToString(MatchCard({ match: partialMatch }));
    expect(html).toContain("Anonymous");
  });

  it("renders avatar from avatarUrl", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("https://example.com/avatar.png");
  });

  it("renders inline initials avatar when avatarUrl is null", () => {
    const html = renderToString(MatchCard({ match: partialMatch }));
    expect(html).not.toContain('src="https://example.com/avatar.png"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(">AN<");
  });

  it("renders the avatar image with lazy loading and explicit dimensions", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="40"');
    expect(html).toContain('height="40"');
    expect(html).toContain("Ada Lovelace&#x27;s avatar");
  });

  it("uses a generic alt text when displayName is null but avatarUrl is provided", () => {
    const matchWithAvatarNoName: SlotMatchDetail = {
      ...partialMatch,
      displayName: null,
      avatarUrl: "https://example.com/avatar.png",
    };
    const html = renderToString(MatchCard({ match: matchWithAvatarNoName }));
    expect(html).toContain("Profile avatar");
  });

  it("renders shortBio", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("Computing pioneer");
  });

  it("renders empty bio when shortBio is null", () => {
    const html = renderToString(MatchCard({ match: partialMatch }));
    expect(html).not.toContain("Computing pioneer");
  });

  it("renders topics as comma-separated names", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("Compilers");
    expect(html).toContain("Type Theory");
  });

  it("renders full topicProfile (not just matched topics)", () => {
    const matchWithDifferentProfile: SlotMatchDetail = {
      userId: "user-4",
      displayName: "Donald Knuth",
      avatarUrl: null,
      shortBio: "Algorithms pioneer",
      topics: [{ id: "topic-a", name: "Algorithms" }],
      topicProfile: [
        { id: "topic-a", name: "Algorithms" },
        { id: "topic-b", name: "Literate Programming" },
        { id: "topic-c", name: "Typesetting" },
      ],
      availabilityIndicator: "available",
      calendarFreshness: "fresh",
    };
    const html = renderToString(MatchCard({ match: matchWithDifferentProfile }));
    expect(html).toContain("Algorithms");
    expect(html).toContain("Literate Programming");
    expect(html).toContain("Typesetting");
  });

  it("renders availability text for available indicator", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("available in this Search window");
  });

  it("renders availability text for partial indicator", () => {
    const html = renderToString(MatchCard({ match: partialMatch }));
    expect(html).toContain("partially available in this Search window");
  });

  it("renders availability text for unavailable indicator", () => {
    const html = renderToString(MatchCard({ match: unavailableMatch }));
    expect(html).toContain("manual only");
  });

  it("renders calendar freshness label as fresh", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("calendar-fresh");
    expect(html).toContain("fresh");
  });

  it("renders calendar freshness label as stale", () => {
    const html = renderToString(MatchCard({ match: partialMatch }));
    expect(html).toContain("calendar-stale");
    expect(html).toContain("stale");
  });

  it("renders calendar freshness label as no calendar connected", () => {
    const html = renderToString(MatchCard({ match: unavailableMatch }));
    expect(html).toContain("calendar-none");
    expect(html).toContain("no calendar connected");
  });

  it("uses semantic dl markup for label/value pairs", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
  });

  it("uses an h3 for the match name to provide heading outline in the drawer", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).toMatch(/<h3[^>]*match-card-name/);
  });

  it("does not expose email addresses in rendered output", () => {
    const html = renderToString(MatchCard({ match: availableMatch }));
    expect(html).not.toMatch(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    );
  });
});
