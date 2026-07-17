import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listActiveTopics,
  setTopicCatalogueRepositoryForTests,
} from "../src/topics/repository";

afterEach(() => {
  setTopicCatalogueRepositoryForTests(null);
});

describe("topic catalogue repository", () => {
  it("filters retired topics out of the active catalogue", async () => {
    setTopicCatalogueRepositoryForTests({
      listCatalogue: () =>
        Promise.resolve([
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
          { id: "topic-3", name: "Design systems", status: "retired" },
        ]),
      listSelectedTopicIds: () => Promise.resolve([]),
      listAssociations: () => Promise.resolve([]),
      saveAssociations: () => Promise.resolve(),
      listActiveAdminTopics: () => Promise.resolve([]),
      retire: () => Promise.resolve({ ok: true }),
    });

    await expect(listActiveTopics()).resolves.toEqual([
      { id: "topic-1", name: "Product strategy", status: "active" },
      { id: "topic-2", name: "AI engineering", status: "active" },
    ]);
  });

  it("declares a unique association constraint for safe upserts", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0003_controlled_topics_unique.sql"),
      "utf8",
    );

    expect(migration).toContain("user_topics_user_id_topic_id_unique");
  });
});
