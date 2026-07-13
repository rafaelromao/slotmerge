import { describe, expect, it } from "vitest";

import { deriveUserTopicAssociations } from "../src/topics/repository";

describe("topic selection persistence", () => {
  it("preserves retired and historical associations", () => {
    expect(
      deriveUserTopicAssociations({
        catalogue: [
          { id: "topic-1", name: "Product strategy", status: "active" },
          { id: "topic-2", name: "AI engineering", status: "active" },
          { id: "topic-3", name: "Design systems", status: "retired" },
        ],
        existingAssociations: [
          { topicId: "topic-1", status: "active" },
          { topicId: "topic-3", status: "active" },
        ],
        selectedTopicIds: ["topic-2"],
      }),
    ).toEqual([
      { topicId: "topic-1", status: "historical" },
      { topicId: "topic-2", status: "active" },
      { topicId: "topic-3", status: "pending-retired" },
    ]);
  });
});
