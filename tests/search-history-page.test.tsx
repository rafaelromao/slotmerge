// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySearchRepository } from "../src/search/in-memory-repository";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { setProfileRepositoryForTests } from "../src/profile/repository";
import { setTopicCatalogueRepositoryForTests } from "../src/topics/repository";

vi.mock("../src/lib/page-context", () => ({
  requirePageContext: vi.fn(),
}));

describe("SearchHistoryPage", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setProfileRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
  });

  it("renders the Organizer display name instead of the raw organizer id", async () => {
    const searchRepo = new InMemorySearchRepository();
    setSearchRepositoryForTests(searchRepo);
    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve(
          userId === "organizer-1"
            ? {
                id: userId,
                email: "organizer@example.com",
                displayName: "Ada Lovelace",
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
      dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
      dateRangeEnd: new Date("2026-07-27T00:00:00.000Z"),
      organizerTimezone: "UTC",
      generatedAt: new Date("2026-07-13T09:00:00.000Z"),
    });
    searchRepo.setSnapshotId(search.id!, "snapshot-1");

    const { requirePageContext } = await import("../src/lib/page-context");
    vi.mocked(requirePageContext).mockResolvedValue({
      user: {
        id: "organizer-1",
        email: "organizer@example.com",
        displayName: "Ada Lovelace",
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

    const { default: SearchHistoryPage } =
      await import("../app/(product)/searches/history/page");

    const html = renderToString(await SearchHistoryPage());

    expect(html).toContain("Search History");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Product strategy");
    expect(html).not.toContain("organizer-1");
    expect(html).not.toContain("topic-1");
  });

  it("paginates history with a Load more cursor after 50 rows", async () => {
    const searchRepo = new InMemorySearchRepository();
    setSearchRepositoryForTests(searchRepo);
    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve({
          id: userId,
          email: `${userId}@example.com`,
          displayName: "Ada Lovelace",
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

    const baseGeneratedAt = Date.UTC(2026, 6, 1, 9, 0, 0);

    for (let index = 1; index <= 51; index += 1) {
      const search = await searchRepo.save({
        organizerId: "organizer-1",
        selectedTopicIds: ["topic-1"],
        minimumMatchingUsers: 2,
        durationMinutes: 60,
        dateRangeStart: new Date("2026-07-06T00:00:00.000Z"),
        dateRangeEnd: new Date("2026-07-27T00:00:00.000Z"),
        organizerTimezone: "UTC",
        generatedAt: new Date(
          baseGeneratedAt + (index - 1) * 24 * 60 * 60 * 1000,
        ),
      });
      searchRepo.setSnapshotId(search.id!, `snapshot-${index}`);
    }

    const { requirePageContext } = await import("../src/lib/page-context");
    vi.mocked(requirePageContext).mockResolvedValue({
      user: {
        id: "organizer-1",
        email: "organizer@example.com",
        displayName: "Ada Lovelace",
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

    const { default: SearchHistoryPage } =
      await import("../app/(product)/searches/history/page");

    const html = renderToString(await SearchHistoryPage());

    expect(html).toContain("Load more");
    expect(html).toContain('href="/searches/history?before=');
    expect(html).not.toContain("snapshot-1");
  });

  it("renders the empty state with a primary action linking to /searches when there are no Search Results", async () => {
    const searchRepo = new InMemorySearchRepository();
    setSearchRepositoryForTests(searchRepo);
    setProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    setTopicCatalogueRepositoryForTests({
      listCatalogue: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
    });

    const { requirePageContext } = await import("../src/lib/page-context");
    vi.mocked(requirePageContext).mockResolvedValue({
      user: {
        id: "organizer-1",
        email: "organizer@example.com",
        displayName: "Ada Lovelace",
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

    const { default: SearchHistoryPage } =
      await import("../app/(product)/searches/history/page");

    const html = renderToString(await SearchHistoryPage());

    expect(html).toContain("search-history-empty-state");
    expect(html).toContain("Run your first Search");
    expect(html).toContain('href="/searches"');
    expect(html).not.toContain("search-history-list");
  });

  it("renders a per-section error banner when history_unavailable is returned", async () => {
    setSearchRepositoryForTests({
      listSearchHistory: () =>
        Promise.reject(new Error("database unreachable")),
      save: () => Promise.reject(new Error("not used")),
      findById: () => Promise.resolve(null),
      listByOrganizer: () => Promise.resolve([]),
      listAll: () => Promise.resolve([]),
    });
    setProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    setTopicCatalogueRepositoryForTests({
      listCatalogue: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
    });

    const { requirePageContext } = await import("../src/lib/page-context");
    vi.mocked(requirePageContext).mockResolvedValue({
      user: {
        id: "organizer-1",
        email: "organizer@example.com",
        displayName: "Ada Lovelace",
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

    const { default: SearchHistoryPage } =
      await import("../app/(product)/searches/history/page");

    const html = renderToString(await SearchHistoryPage());

    expect(html).toContain("search-history-error-banner");
    expect(html).toContain('role="alert"');
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("search-history-empty-state");
    expect(html).not.toContain("Run your first Search");
  });
});
