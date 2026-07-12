import { describe, expect, it } from "vitest";

import Home from "../app/page";

describe("app shell", () => {
  it("renders a minimal SlotMerge shell without product behavior", () => {
    const page = Home();

    expect(page.type).toBe("main");
    expect(JSON.stringify(page.props)).toContain("SlotMerge");
    expect(JSON.stringify(page.props)).toContain(
      "Local MVP runtime scaffold is ready",
    );
  });
});
