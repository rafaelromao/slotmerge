// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySearchRepository } from "../src/search/in-memory-repository";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { InMemorySearchResultRepository } from "../src/search/search-result-in-memory-repository";
import { setSearchResultRepositoryForTests } from "../src/search/search-result-repository";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";

vi.mock("../src/lib/page-context", () => ({
  requirePageContext: vi.fn(),
}));

vi.mock("../src/topics/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/topics/repository")>();
  return {
    ...actual,
    listActiveTopics: vi.fn(() =>
      Promise.resolve([
        { id: "topic-1", name: "Product strategy", status: "active" as const },
        { id: "topic-2", name: "AI engineering", status: "active" as const },
      ]),
    ),
  };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("SearchResultPage", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  it("renders the Search Result header, ordinary week links, and the weekly grid from the stored snapshot", async () => {
    const searchRepo = new InMemorySearchRepository();
    const resultRepo = new InMemorySearchResultRepository();
    setSearchRepositoryForTests(searchRepo);
    setSearchResultRepositoryForTests(resultRepo);
    setTopicCatalogueRepositoryForTests({
      listCatalogue: () =>
        Promise.resolve([
          {
            id: "topic-1",
            name: "Product strategy",
            status: "active" as const,
          },
          {
            id: "topic-2",
            name: "AI engineering",
            status: "active" as const,
          },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
    });

    const search = await searchRepo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-27T00:00:00.000Z"),
      organizerTimezone: "UTC",
      generatedAt: new Date("2026-07-13T09:00:00.000Z"),
    });

    await resultRepo.save({
      searchId: search.id!,
      createdAt: new Date("2026-07-13T09:00:00.000Z"),
      snapshotJson: {
        generatedAt: "2026-07-13T09:00:00.000Z",
        organizerTimezone: "UTC",
        dateRangeStart: "2026-07-06T00:00:00.000Z",
        dateRangeEnd: "2026-07-27T00:00:00.000Z",
        durationMinutes: 60,
        slots: [
          {
            startUtc: "2026-07-13T13:00:00.000Z",
            matchCount: 2,
            matches: [
              {
                userId: "user-1",
                displayName: "Ada Lovelace",
                avatarUrl: null,
                shortBio: "Computing pioneer",
                topics: [{ id: "topic-1", name: "Product strategy" }],
                topicProfile: [{ id: "topic-1", name: "Product strategy" }],
                availabilityIndicator: "available",
                calendarFreshness: "fresh",
              },
            ],
          },
        ],
      },
    });

    const { requirePageContext } = await import("../src/lib/page-context");
    vi.mocked(requirePageContext).mockResolvedValue({
      user: {
        id: "organizer-1",
        email: "organizer@example.com",
        displayName: "Organizer",
        avatarUrl: null,
        shortBio: null,
        role: "organizer",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token",
      isAuthed: true,
      isAdmin: false,
      isOrganizerOrAdmin: true,
    });

    const { default: SearchResultPage } =
      await import("../app/(product)/searches/[id]/page");

    const html = renderToString(
      await SearchResultPage({
        params: Promise.resolve({ id: search.id! }),
        searchParams: Promise.resolve({ week: "2026-07-13" }),
      }),
    );

    expect(html).toContain("Search Result");
    expect(html).toContain("Product strategy");
    expect(html).toContain("Minimum");
    expect(html).toContain("2");
    expect(html).toContain("60");
    expect(html).toContain("minutes");
    expect(html).toContain("UTC");
    expect(html).toContain("Search ID");
    expect(html).toContain(search.id!);
    expect(html).toContain(`href="/searches/${search.id}?week=2026-07-06"`);
    expect(html).toContain(`href="/searches/${search.id}?week=2026-07-20"`);
    expect(html).toContain('href="/searches/history"');
    expect(html).toContain('data-testid="slot-0-0"');
    expect(html.match(/role="columnheader"/g)).toHaveLength(7);
  });

  it("keeps the requested week in the Organizer timezone", async () => {
    const searchRepo = new InMemorySearchRepository();
    const resultRepo = new InMemorySearchResultRepository();
    setSearchRepositoryForTests(searchRepo);
    setSearchResultRepositoryForTests(resultRepo);
    setTopicCatalogueRepositoryForTests({
      listCatalogue: () =>
        Promise.resolve([
          {
            id: "topic-1",
            name: "Product strategy",
            status: "active" as const,
          },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
    });

    const search = await searchRepo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T04:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-27T04:00:00.000Z"),
      organizerTimezone: "America/New_York",
      generatedAt: new Date("2026-07-13T09:00:00.000Z"),
    });

    await resultRepo.save({
      searchId: search.id!,
      createdAt: new Date("2026-07-13T09:00:00.000Z"),
      snapshotJson: {
        generatedAt: "2026-07-13T09:00:00.000Z",
        organizerTimezone: "America/New_York",
        dateRangeStart: "2026-07-06T04:00:00.000Z",
        dateRangeEnd: "2026-07-27T04:00:00.000Z",
        durationMinutes: 60,
        slots: [],
      },
    });

    const { requirePageContext } = await import("../src/lib/page-context");
    vi.mocked(requirePageContext).mockResolvedValue({
      user: {
        id: "organizer-1",
        email: "organizer@example.com",
        displayName: "Organizer",
        avatarUrl: null,
        shortBio: null,
        role: "organizer",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token",
      isAuthed: true,
      isAdmin: false,
      isOrganizerOrAdmin: true,
    });

    const { default: SearchResultPage } = await import(
      "../app/(product)/searches/[id]/page",
    );

    const html = renderToString(
      await SearchResultPage({
        params: Promise.resolve({ id: search.id! }),
        searchParams: Promise.resolve({ week: "2026-07-13" }),
      }),
    );

    expect(html).toContain("Mon, Jul 13, 2026");
    expect(html).toContain(`href="/searches/${search.id}?week=2026-07-06"`);
    expect(html).toContain(`href="/searches/${search.id}?week=2026-07-20"`);
    expect(html.match(/role="columnheader"/g)).toHaveLength(7);
  });
});
