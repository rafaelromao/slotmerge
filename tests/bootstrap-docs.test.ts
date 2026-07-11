import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("development bootstrap documentation", () => {
  it("documents the one-command development start", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("pnpm dev");
    expect(readme).toContain("DATABASE_URL");
  });
});
