import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("local MVP stack contract", () => {
  it("documents one command that starts postgres, web, and worker separately", async () => {
    const [packageJson, compose, docs] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("docker-compose.yml", "utf8"),
      readFile("docs/local-stack.md", "utf8"),
    ]);

    expect(packageJson).toContain('"local:up": "docker compose up --build"');
    expect(compose).toContain("postgres:");
    expect(compose).toContain("web:");
    expect(compose).toContain("worker:");
    expect(docs).toContain("pnpm local:up");
    expect(docs).toContain("pnpm local:verify");
  });

  it("gates GCP promotion on local verification in GitHub Actions", async () => {
    const workflow = await readFile(".github/workflows/deploy.yml", "utf8");

    expect(workflow).toContain("local-verify:");
    expect(workflow).toContain("pnpm local:verify");
    expect(workflow).toMatch(/build-image:[\s\S]*needs:[\s\S]*local-verify/);
    expect(workflow).toMatch(/deploy-staging:[\s\S]*needs:[\s\S]*build-image/);
    expect(workflow).toMatch(/deploy-production:[\s\S]*needs:[\s\S]*deploy-staging/);
  });
});
