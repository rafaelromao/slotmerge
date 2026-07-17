import { describe, expect, it } from "vitest";

import { GET, PUT } from "../app/me/topics/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import {
  setTopicCatalogueRepositoryForTests,
  type TopicCatalogueRepository,
} from "../src/topics/repository";
import {
  setMeTopicProposalsRepositoryForTests,
  type MeTopicProposalsRepository,
} from "../src/topics/me-topic-proposals-route";

describe("/me/topics route", () => {
  it("rejects unauthenticated requests", async () => {
    const response = await GET(new Request("http://localhost/me/topics"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("renders the active catalogue for an authenticated user", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: null,
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    setTopicCatalogueRepositoryForTests({
      listCatalogue: () =>
        Promise.resolve([
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
          { id: "topic-3", name: "Design systems", status: "retired" },
        ]),
      listSelectedTopicIds: () => Promise.resolve(["topic-2"]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
      listActiveAdminTopics: () => Promise.resolve([]),
      retire: () => Promise.resolve({ ok: true }),
    });

    const mockMeProposalsRepository: MeTopicProposalsRepository = {
      listUserTopicProposals: () => Promise.resolve([]),
    };
    setMeTopicProposalsRepositoryForTests(mockMeProposalsRepository);

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await GET(
      new Request("http://localhost/me/topics", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("My Topics");
    expect(html).toContain('name="csrfToken" value="csrf-token-1"');
    expect(html).toContain("Product strategy");
    expect(html).toContain("AI engineering");
    expect(html).toContain('value="topic-2"');
    expect(html).toContain('checked=""');
    expect(html).not.toContain("Design systems");

    setSessionRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
    setMeTopicProposalsRepositoryForTests(null);
  });

  it("persists active topic selections via PUT", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: null,
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    let savedTopicIds: string[] | null = null;
    let savedAssociations: Array<{ topicId: string; status: string }> | null =
      null;

    const repository: TopicCatalogueRepository = {
      listCatalogue: () =>
        Promise.resolve([
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
          { id: "topic-3", name: "Design systems", status: "retired" },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: ({ associations }) => {
        savedAssociations = associations;
        savedTopicIds = associations
          .filter((association) => association.status === "active")
          .map((association) => association.topicId);
        return Promise.resolve();
      },
      listActiveAdminTopics: () => Promise.resolve([]),
      retire: () => Promise.resolve({ ok: true }),
    };

    setTopicCatalogueRepositoryForTests(repository);

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await PUT(
      new Request("http://localhost/me/topics", {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          topicIds: ["topic-1", "topic-3"],
          csrfToken: "csrf-token-1",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(savedTopicIds).toEqual(["topic-1"]);
    expect(savedAssociations).toEqual([
      { topicId: "topic-1", status: "active" },
    ]);

    setSessionRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
    setMeTopicProposalsRepositoryForTests(null);
  });

  it("rejects a mutation with an invalid CSRF token", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === "session-1"
            ? {
                user: {
                  id: "user-1",
                  email: "user@example.com",
                  displayName: null,
                  avatarUrl: null,
                  shortBio: null,
                  role: "user",
                  status: "active",
                  profileTimezone: null,
                  bufferMinutes: 0,
                },
                csrfToken: "csrf-token-1",
              }
            : null,
        ),
    });

    setTopicCatalogueRepositoryForTests({
      listCatalogue: () => Promise.resolve([]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
      listActiveAdminTopics: () => Promise.resolve([]),
      retire: () => Promise.resolve({ ok: true }),
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });
    const response = await PUT(
      new Request("http://localhost/me/topics", {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ topicIds: ["topic-1"], csrfToken: "wrong" }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_csrf_token",
    });

    setSessionRepositoryForTests(null);
    setTopicCatalogueRepositoryForTests(null);
    setMeTopicProposalsRepositoryForTests(null);
  });
});
