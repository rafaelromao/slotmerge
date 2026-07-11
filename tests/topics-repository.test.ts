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
    });

    await expect(listActiveTopics()).resolves.toEqual([
      { id: "topic-1", name: "Product strategy", status: "active" },
      { id: "topic-2", name: "AI engineering", status: "active" },
    ]);
  });
});
