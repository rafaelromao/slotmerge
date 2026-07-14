import { afterEach, describe, expect, it } from "vitest";

import type { DiscoverableUserRepository } from "./discoverable-user-repository";
import { setDiscoverableUserRepositoryForTests } from "./discoverable-user-repository";

class InMemoryDiscoverableUserRepository implements DiscoverableUserRepository {
  constructor(
    private readonly users: Array<{
      id: string;
      hasConsent: boolean;
      isActive: boolean;
      topicIds: string[];
    }>,
  ) {}

  listDiscoverableUserIds(selectedTopicIds: string[]): Promise<string[]> {
    if (selectedTopicIds.length === 0) {
      return Promise.resolve([]);
    }

    const matching = this.users.filter((u) => {
      if (!u.hasConsent) return false;
      if (!u.isActive) return false;
      if (!u.topicIds.some((t) => selectedTopicIds.includes(t))) {
        return false;
      }
      return true;
    });

    return Promise.resolve(matching.map((u) => u.id));
  }
}

describe("DiscoverableUserRepository", () => {
  afterEach(() => {
    setDiscoverableUserRepositoryForTests(null);
  });

  it("returns empty array when no users exist", async () => {
    const repo = new InMemoryDiscoverableUserRepository([]);
    setDiscoverableUserRepositoryForTests(repo);

    const result = await repo.listDiscoverableUserIds(["topic-1"]);
    expect(result).toEqual([]);
  });

  it("returns empty array when selectedTopicIds is empty", async () => {
    const repo = new InMemoryDiscoverableUserRepository([
      {
        id: "user-1",
        hasConsent: true,
        isActive: true,
        topicIds: ["topic-1"],
      },
    ]);
    setDiscoverableUserRepositoryForTests(repo);

    const result = await repo.listDiscoverableUserIds([]);
    expect(result).toEqual([]);
  });

  it("returns user ids who have consent, are active, and have matching topics", async () => {
    const repo = new InMemoryDiscoverableUserRepository([
      {
        id: "user-1",
        hasConsent: true,
        isActive: true,
        topicIds: ["topic-1", "topic-2"],
      },
      {
        id: "user-2",
        hasConsent: true,
        isActive: true,
        topicIds: ["topic-2"],
      },
      {
        id: "user-3",
        hasConsent: false,
        isActive: true,
        topicIds: ["topic-1"],
      },
    ]);
    setDiscoverableUserRepositoryForTests(repo);

    const result = await repo.listDiscoverableUserIds(["topic-1"]);
    expect(result).toEqual(["user-1"]);
  });

  it("excludes suspended users", async () => {
    const repo = new InMemoryDiscoverableUserRepository([
      {
        id: "user-1",
        hasConsent: true,
        isActive: false,
        topicIds: ["topic-1"],
      },
    ]);
    setDiscoverableUserRepositoryForTests(repo);

    const result = await repo.listDiscoverableUserIds(["topic-1"]);
    expect(result).toEqual([]);
  });

  it("excludes users without discoverability consent", async () => {
    const repo = new InMemoryDiscoverableUserRepository([
      {
        id: "user-1",
        hasConsent: false,
        isActive: true,
        topicIds: ["topic-1"],
      },
    ]);
    setDiscoverableUserRepositoryForTests(repo);

    const result = await repo.listDiscoverableUserIds(["topic-1"]);
    expect(result).toEqual([]);
  });

  it("returns users with any matching topic when multiple topics selected", async () => {
    const repo = new InMemoryDiscoverableUserRepository([
      {
        id: "user-1",
        hasConsent: true,
        isActive: true,
        topicIds: ["topic-1"],
      },
      {
        id: "user-2",
        hasConsent: true,
        isActive: true,
        topicIds: ["topic-2"],
      },
    ]);
    setDiscoverableUserRepositoryForTests(repo);

    const result = await repo.listDiscoverableUserIds(["topic-1", "topic-2"]);
    expect(result).toHaveLength(2);
  });
});
