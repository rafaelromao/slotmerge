import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const DOCUMENT_PATH = "docs/t24-closure-evidence.md";

describe("T24 closure evidence document", () => {
  it("exists at the canonical path with the T24 top-level heading", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");

    const headingMatch = document.match(/^# .+$/m);
    expect(headingMatch).not.toBeNull();
    expect(headingMatch?.[0] ?? "").toMatch(/^# T24 closure evidence\b/);
  });
});
