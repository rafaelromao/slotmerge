import { describe, expect, it } from "vitest";

import Home from "../src/app/page";

describe("app shell", () => {
  it("renders a minimal SlotMerge shell without product behavior", () => {
    const page = Home();

    expect(page.type).toBe("main");
    expect(JSON.stringify(page.props)).toContain("SlotMerge");
    expect(JSON.stringify(page.props)).toContain("Runnable foundation");
    expect(JSON.stringify(page.props)).not.toContain("Search");
    expect(JSON.stringify(page.props)).not.toContain("Topic");
    expect(JSON.stringify(page.props)).not.toContain("Availability");
    expect(JSON.stringify(page.props)).not.toContain("Calendar Connection");
  });
});
