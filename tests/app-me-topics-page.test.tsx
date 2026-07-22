// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionModule from "../src/auth/session";
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
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

describe("/me/topics (topics page)", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Alice User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-user-1",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    setTopicsPageCatalogueRepositoryForTests(null);
    setTopicsPageProposalsRepositoryForTests(null);
  });

  it("renders the active catalogue sorted alphabetically with one checkbox per topic", async () => {
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

    const { default: TopicsPage } = await import(
      "../app/(product)/me/topics/page"
    );
    const html = renderToString(await TopicsPage({}));

    expect(html).toContain("My Topics");
    expect(html).toContain("AI engineering");
    expect(html).toContain("Product strategy");
    expect(html).toMatch(/name="topicIds" value="topic-1"/);
    expect(html).toMatch(/name="topicIds" value="topic-2"/);
  });

  it("pre-checks the topics the user already has active", async () => {
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () =>
        Promise.resolve([
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
        ]),
      listSelectedTopicIds: () => Promise.resolve(["topic-1"]),
    });
    setTopicsPageProposalsRepositoryForTests({
      listUserProposals: () => Promise.resolve([]),
    });

    const { default: TopicsPage } = await import(
      "../app/(product)/me/topics/page"
    );
    const html = renderToString(await TopicsPage({}));

    expect(html).toMatch(
      /data-testid="topics-catalogue-checkbox-topic-1"[^>]*checked|<input[^>]*checked[^>]*value="topic-1"/,
    );
    expect(html).not.toMatch(
      /data-testid="topics-catalogue-checkbox-topic-2"[^>]*checked|<input[^>]*checked[^>]*value="topic-2"/,
    );
  });

  it("renders the My Proposals section with status badges for each proposal", async () => {
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () =>
        Promise.resolve([
          {
            id: "topic-approved",
            name: "Approved topic",
            status: "active",
          },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
    });
    setTopicsPageProposalsRepositoryForTests({
      listUserProposals: () =>
        Promise.resolve([
          {
            id: "proposal-pending",
            candidateName: "Brand new topic",
            status: "pending",
          },
          {
            id: "proposal-approved",
            candidateName: "Approved topic",
            status: "approved",
          },
          {
            id: "proposal-rejected",
            candidateName: "Rejected topic",
            status: "rejected",
          },
          {
            id: "proposal-retired",
            candidateName: "Old retired topic",
            status: "approved",
          },
        ]),
    });

    const { default: TopicsPage } = await import(
      "../app/(product)/me/topics/page"
    );
    const html = renderToString(await TopicsPage({}));

    expect(html).toContain("topics-proposals-list");
    expect(html).toContain("topics-proposal-badge--pending");
    expect(html).toContain("topics-proposal-badge--active");
    expect(html).toContain("topics-proposal-badge--rejected");
    expect(html).toContain("topics-proposal-badge--retired");
    expect(html).toContain("Pending review");
    expect(html).toContain("Active");
    expect(html).toContain("Rejected");
    expect(html).toContain("Retired");
  });

  it("renders the propose form with the CSRF token and empty-state copy when there are no proposals", async () => {
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
    });
    setTopicsPageProposalsRepositoryForTests({
      listUserProposals: () => Promise.resolve([]),
    });

    const { default: TopicsPage } = await import(
      "../app/(product)/me/topics/page"
    );
    const html = renderToString(await TopicsPage({}));

    expect(html).toContain("topics-propose-form");
    expect(html).toContain('name="_csrf" value="csrf-user-1"');
    expect(html).toContain("topics-propose-input");
    expect(html).toContain("topics-catalogue-empty");
    expect(html).toContain("topics-my-proposals-empty");
  });

  it("renders the Saved indicator when searchParams.saved === '1'", async () => {
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
    });
    setTopicsPageProposalsRepositoryForTests({
      listUserProposals: () => Promise.resolve([]),
    });

    const { default: TopicsPage } = await import(
      "../app/(product)/me/topics/page"
    );
    const html = renderToString(
      await TopicsPage({ searchParams: Promise.resolve({ saved: "1" }) }),
    );

    expect(html).toContain("topics-saved-indicator");
    expect(html).toContain("Saved");
  });

  it("does not show the Saved indicator when searchParams.saved is absent", async () => {
    setTopicsPageCatalogueRepositoryForTests({
      listActive: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
    });
    setTopicsPageProposalsRepositoryForTests({
      listUserProposals: () => Promise.resolve([]),
    });

    const { default: TopicsPage } = await import(
      "../app/(product)/me/topics/page"
    );
    const html = renderToString(await TopicsPage({}));

    expect(html).not.toContain("topics-saved-indicator");
  });
});
