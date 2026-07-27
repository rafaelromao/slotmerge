// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySearchRepository } from "../src/search/in-memory-repository";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { setProfileRepositoryForTests } from "../src/profile/repository";

vi.mock("../src/lib/page-context", () => ({
  requirePageContext: vi.fn(),
}));

describe("SearchHistoryPage", () => {
  beforeEach(() => {
    setSearchRepositoryForTests(null);
    setProfileRepositoryForTests(null);
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
    expect(html).not.toContain("organizer-1");
  });
});
