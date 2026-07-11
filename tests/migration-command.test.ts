import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("database migration bootstrap", () => {
  it("defines the migration command and Drizzle migration configuration", async () => {
    const [packageJson, drizzleConfig] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("drizzle.config.ts", "utf8"),
    ]);

    expect(packageJson).toContain('"db:migrate": "drizzle-kit migrate"');
    expect(drizzleConfig).toContain("DATABASE_URL");
    expect(drizzleConfig).toContain("./drizzle");
  });
});
