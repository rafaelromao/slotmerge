// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionModule from "../src/auth/session";
import { InMemorySearchRepository } from "../src/search/in-memory-repository";
import { setSearchRepositoryForTests } from "../src/search/repository";
import { InMemorySearchResultRepository } from "../src/search/search-result-in-memory-repository";
import { setSearchResultRepositoryForTests } from "../src/search/search-result-repository";
import { sealSearchFeedbackToken } from "../src/workflow/search-feedback";
import {
  setDiscoverableUserRepositoryForTests,
  type DiscoverableUserRepository,
} from "../src/search/discoverable-user-repository";
import {
  setProfileRepositoryForTests,
  type ProfileRepository,
  type UserProfile,
} from "../src/profile/repository";
import {
  setTopicsPageCatalogueRepositoryForTests,
  setTopicsPageProposalsRepositoryForTests,
} from "../src/topics/page-repositories";

vi.mock("../src/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../src/auth/session")>(
    "../src/auth/session",
  );
  return {
    ...actual,
    getSessionFromRequest: vi.fn(),
  };
});

vi.mock("next/headers", () => {
  const obj = {
    headers: () => ({ forEach: () => undefined }),
    cookies: () => ({ toString: () => "" }),
  };
  return obj;
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

class StubProfileRepository implements ProfileRepository {
  constructor(private readonly profile: UserProfile | null) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    await Promise.resolve();
    if (!this.profile) return null;
    if (this.profile.id !== userId) return null;
    return this.profile;
  }
  async updateByUserId(): Promise<UserProfile | null> {
    await Promise.resolve();
    return null;
  }
  async deleteByUserId(): Promise<boolean> {
    await Promise.resolve();
    return false;
  }
}

class StubDiscoverableRepository implements DiscoverableUserRepository {
  constructor(private readonly userIds: string[] = []) {}
  async listDiscoverableUserIds() {
    await Promise.resolve();
    return [...this.userIds];
  }
}

const organizerProfile: UserProfile = {
  id: "user-1",
  email: "organizer@example.com",
  displayName: "Organizer",
  avatarUrl: null,
  shortBio: null,
  role: "organizer",
  status: "active",
  profileTimezone: "America/Los_Angeles",
  bufferMinutes: 0,
};

const plainProfile: UserProfile = {
  ...organizerProfile,
  role: "user",
};

describe("/searches page", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("FIXTURE_DATE", "2026-07-08T15:00:00.000Z");
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: organizerProfile,
      csrfToken: "csrf-token-organizer",
    });
    setProfileRepositoryForTests(new StubProfileRepository(organizerProfile));
    setDiscoverableUserRepositoryForTests(
      new StubDiscoverableRepository([
        "user-1",
        "user-2",
        "user-3",
        "user-4",
        "user-5",
      ]),
    );
    setSearchResultRepositoryForTests(new InMemorySearchResultRepository());
    setSearchRepositoryForTests(new InMemorySearchRepository());
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () =>
        Promise.resolve([
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
    });
    setTopicsPageProposalsRepositoryForTests({
      listUserProposals: () => Promise.resolve([]),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    setProfileRepositoryForTests(null);
    setDiscoverableUserRepositoryForTests(null);
    setSearchResultRepositoryForTests(null);
    setSearchRepositoryForTests(null);
    setTopicsPageCatalogueRepositoryForTests(null);
    setTopicsPageProposalsRepositoryForTests(null);
  });

  it("renders the Search form pre-filled with the per-Organizer defaults", async () => {
    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const html = renderToString(await SearchesPage({}));

    expect(html).toContain("Run a Search");
    expect(html).toContain("searches-form");
    expect(html).toContain('name="minimumMatchingUsers"');
    expect(html).toContain('name="durationMinutes"');
    expect(html).toContain('name="organizerTimezone"');
    expect(html).toContain("Users must have all selected active Topics.");
  });

  it("formats week defaults in the Organizer timezone", async () => {
    const tokyoProfile = {
      ...organizerProfile,
      profileTimezone: "Asia/Tokyo",
    };
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: tokyoProfile,
      csrfToken: "csrf-token-organizer",
    });
    setProfileRepositoryForTests(new StubProfileRepository(tokyoProfile));

    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const html = renderToString(await SearchesPage({}));

    expect(html).toContain('value="2026-07-06"');
    expect(html).toContain('value="2026-08-10"');
  });

  it("throws NEXT_NOT_FOUND for a plain user", async () => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: plainProfile,
      csrfToken: "csrf-token-user",
    });
    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    await expect(SearchesPage({})).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the empty state and disables Run Search when the catalogue is empty", async () => {
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
    });
    setDiscoverableUserRepositoryForTests(new StubDiscoverableRepository([]));

    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const html = renderToString(await SearchesPage({}));

    expect(html).toContain("searches-topics-empty");
    expect(html).toContain("No active Topics yet");
    expect(html).toMatch(/disabled[^>]*title="No active Topics available\."/);
  });

  it("renders the inline organizer_timezone_required banner when feedback token decodes", async () => {
    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const sealed = await sealSearchFeedbackToken({
      code: "organizer_timezone_required",
      field: "organizerTimezone",
      values: {
        selectedTopicIds: [],
        minimumMatchingUsers: "2",
        durationMinutes: "60",
        dateRangeStart: "2026-07-07",
        dateRangeEnd: "2026-08-11",
        organizerTimezone: "",
      },
    });
    const html = renderToString(
      await SearchesPage({
        searchParams: Promise.resolve({ feedback: sealed }),
      }),
    );

    expect(html).toContain("searches-error-banner");
    expect(html).toContain(
      "Set your profile timezone before running a Search.",
    );
  });

  it("renders the inline selected_topics_required error next to the topic list", async () => {
    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const sealed = await sealSearchFeedbackToken({
      code: "selected_topics_required",
      field: "selectedTopics",
      values: {
        selectedTopicIds: [],
        minimumMatchingUsers: "2",
        durationMinutes: "60",
        dateRangeStart: "2026-07-07",
        dateRangeEnd: "2026-08-11",
        organizerTimezone: "America/Los_Angeles",
      },
    });
    const html = renderToString(
      await SearchesPage({
        searchParams: Promise.resolve({ feedback: sealed }),
      }),
    );

    expect(html).toContain("searches-field-error-selectedTopics");
    expect(html).toContain("Select at least one active Topic.");
  });

  it("preserves submitted values when rendering an inline validation error", async () => {
    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const sealed = await sealSearchFeedbackToken({
      code: "duration_out_of_range",
      field: "durationMinutes",
      values: {
        selectedTopicIds: ["topic-1", "topic-2"],
        minimumMatchingUsers: "4",
        durationMinutes: "10",
        dateRangeStart: "2026-07-07",
        dateRangeEnd: "2026-08-11",
        organizerTimezone: "Europe/Lisbon",
      },
    });
    const html = renderToString(
      await SearchesPage({
        searchParams: Promise.resolve({ feedback: sealed }),
      }),
    );

    expect(html).toContain('value="10"');
    expect(html).toContain('value="4"');
    expect(html).toContain('value="Europe/Lisbon"');
    expect(html).toContain('value="2026-07-07"');
    expect(html).toContain('value="2026-08-11"');
    expect(html).toMatch(/checked="" value="topic-1"/);
    expect(html).toMatch(/checked="" value="topic-2"/);
  });

  it("renders the topic_retired error when a topic id is no longer active", async () => {
    const { default: SearchesPage } =
      await import("../app/(product)/searches/page");
    const sealed = await sealSearchFeedbackToken({
      code: "topic_retired",
      field: "selectedTopics",
      values: {
        selectedTopicIds: ["topic-1", "topic-retired"],
        minimumMatchingUsers: "2",
        durationMinutes: "60",
        dateRangeStart: "2026-07-07",
        dateRangeEnd: "2026-08-11",
        organizerTimezone: "America/Los_Angeles",
      },
    });
    const html = renderToString(
      await SearchesPage({
        searchParams: Promise.resolve({ feedback: sealed }),
      }),
    );

    expect(html).toContain("searches-field-error-selectedTopics");
    expect(html).toContain("no longer active");
  });
});
