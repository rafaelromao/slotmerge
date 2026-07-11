import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import TopicsPage from "../app/me/topics/page";

describe("GET /me/topics", () => {
  it("shows active topics and hides retired topics", () => {
    const html = renderToStaticMarkup(TopicsPage());

    expect(html).toContain("<main");
    expect(html).toContain("My Topics");
    expect(html).toContain("Active Topics");
    expect(html).toContain("Product strategy");
    expect(html).toContain("AI engineering");
    expect(html).not.toContain("Design systems");
    expect(html).not.toContain("Sales enablement");
  });
});
