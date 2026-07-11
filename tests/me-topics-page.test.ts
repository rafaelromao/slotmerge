import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { TopicsPageView } from "../src/topics/topics-page-view";

describe("GET /me/topics", () => {
  it("shows active topics and allows choosing them", () => {
    const html = renderToStaticMarkup(
      TopicsPageView({
        catalogue: [
          { id: "topic-1", name: "Product strategy" },
          { id: "topic-2", name: "AI engineering" },
        ],
        selectedTopicIds: ["topic-2"],
        csrfToken: "csrf-token-1",
      }),
    );

    expect(html).toContain("<main");
    expect(html).toContain("My Topics");
    expect(html).toContain("Product strategy");
    expect(html).toContain("AI engineering");
    expect(html).toContain('name="csrfToken" value="csrf-token-1"');
    expect(html).toContain('value="topic-2"');
    expect(html).toContain("checked");
    expect(html).toContain("Save topics");
  });
});
