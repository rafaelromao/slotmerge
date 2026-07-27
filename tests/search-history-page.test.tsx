// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setProfileRepositoryForTests } from "../src/profile/repository";
import { InMemorySearchRepository } from "../src/search/in-memory-repository";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";

vi.mock("../src/lib/page-context", () => ({
  requirePageContext: vi.fn(),
}));

describe("SearchHistoryPage", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
    setProfileRepositoryForTests(null);
  });

  it("renders the newest history rows and rerun shell", async () => {
    const searchRepo = new InMemorySearchRepository();
    setSearchRepositoryForTests(searchRepo);
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
    setProfileRepositoryForTests({
      findByUserId: (userId: string) =>
        Promise.resolve(
          userId === "organizer-1"
            ? {
                id: userId,
                email: "organizer@example.com",
                displayName: "Organizer One",
                avatarUrl: null,
                shortBio: null,
                role: "organizer",
                status: "active",
                profileTimezone: "UTC",
                bufferMinutes: 0,
              }
            : null,
        ),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });

    const older = await searchRepo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-13T00:00:00.000Z"),
      organizerTimezone: "UTC",
      generatedAt: new Date("2026-07-07T09:00:00.000Z"),
    });
    const newer = await searchRepo.save({
      organizerId: "organizer-1",
      selectedTopicIds: ["topic-1"],
      minimumMatchingUsers: 2,
      durationMinutes: 60,
      dateRangeStart: new Date("2026-07-13T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-20T00:00:00.000Z"),
      organizerTimezone: "UTC",
      generatedAt: new Date("2026-07-08T09:00:00.000Z"),
    });

    searchRepo.setSnapshotId(older.id!, "snapshot-older");
    searchRepo.setSnapshotId(newer.id!, "snapshot-newer");

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
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token",
      isAuthed: true,
      isAdmin: false,
      isOrganizerOrAdmin: true,
    });

    const { default: SearchHistoryPage } = await import(
      "../app/(product)/searches/history/page",
    );

    const html = renderToString(await SearchHistoryPage());

    expect(html).toContain("Search History");
    expect(html).toContain("Newest first.");
    expect(html).toContain("Organizer One");
    expect(html.indexOf(newer.id!)).toBeLessThan(html.indexOf(older.id!));
    expect(html).toContain("Open Search Result");
    expect(html).toContain('button type="button" popoverTarget="rerun-search-confirm-');
    expect(html).toContain("Re-run this Search?");
  });

  it("renders a load more link after 50 rows", async () => {
    const searchRepo = new InMemorySearchRepository();
    setSearchRepositoryForTests(searchRepo);
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
    setProfileRepositoryForTests({
      findByUserId: (userId: string) =>
        Promise.resolve({
          id: userId,
          email: `${userId}@example.com`,
          displayName: `Organizer ${userId.slice(-2)}`,
          avatarUrl: null,
          shortBio: null,
          role: "organizer",
          status: "active",
          profileTimezone: "UTC",
          bufferMinutes: 0,
        }),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });

    for (let i = 0; i < 51; i += 1) {
      const search = await searchRepo.save({
        organizerId: `organizer-${i}`,
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
        dateRangeEnd: new Date("2026-07-13T00:00:00.000Z"),
        organizerTimezone: "UTC",
        generatedAt: new Date(Date.UTC(2026, 6, 51 - i, 9, 0, 0)),
      });
      searchRepo.setSnapshotId(search.id!, `snapshot-${i}`);
    }

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
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token",
      isAuthed: true,
      isAdmin: false,
      isOrganizerOrAdmin: true,
    });

    const { default: SearchHistoryPage } = await import(
      "../app/(product)/searches/history/page",
    );

    const html = renderToString(await SearchHistoryPage());

    expect(html).toContain("Load more");
    expect(html).toContain("/searches/history?before=");
  });
});
