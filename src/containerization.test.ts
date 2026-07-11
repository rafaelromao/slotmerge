import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Production Docker containerization", () => {
  describe("Dockerfile", () => {
    it("has a production Dockerfile at repo root", () => {
      const dockerfilePath = join(REPO_ROOT, "Dockerfile");
      expect(() => readFileSync(dockerfilePath, "utf8")).not.toThrow();
    });

    it("uses node:22-bookworm-slim base", () => {
      const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
      expect(dockerfile).toMatch(/^FROM node:22-bookworm-slim AS \w+/m);
    });

    it("installs dependencies with --frozen-lockfile", () => {
      const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
      expect(dockerfile).toMatch(/pnpm install --frozen-lockfile/);
    });

    it("exposes PORT for Cloud Run", () => {
      const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
      expect(dockerfile).toMatch(/EXPOSE\s+\$\{?PORT\}?/);
    });

    it("uses an entrypoint script that respects RUNTIME_MODE", () => {
      const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
      expect(dockerfile).toMatch(/ENTRYPOINT|CMD.*docker-entrypoint/);
      expect(dockerfile).toMatch(/RUNTIME_MODE/);
    });
  });

  describe("Runtime entrypoint", () => {
    it("has a runtime entrypoint script", () => {
      const entrypointPath = join(REPO_ROOT, "docker-entrypoint.sh");
      expect(() => readFileSync(entrypointPath, "utf8")).not.toThrow();
    });

    it("entrypoint selects web mode when RUNTIME_MODE=web", () => {
      const entrypoint = readFileSync(
        join(REPO_ROOT, "docker-entrypoint.sh"),
        "utf8",
      );
      expect(entrypoint).toMatch(/RUNTIME_MODE.*web/s);
      expect(entrypoint).toMatch(/next start/);
    });

    it("entrypoint selects worker mode when RUNTIME_MODE=worker", () => {
      const entrypoint = readFileSync(
        join(REPO_ROOT, "docker-entrypoint.sh"),
        "utf8",
      );
      expect(entrypoint).toMatch(/RUNTIME_MODE.*worker/s);
      expect(entrypoint).toMatch(/graphile-worker|tsx.*run\.ts/);
    });

    it("entrypoint fails fast for unknown RUNTIME_MODE", () => {
      const entrypoint = readFileSync(
        join(REPO_ROOT, "docker-entrypoint.sh"),
        "utf8",
      );
      expect(entrypoint).toMatch(/echo.*unknown.*mode|exit 1/i);
    });
  });

  describe("package.json production scripts", () => {
    it("has start:web script", () => {
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
      ) as { scripts?: Record<string, string> };
      expect(pkg.scripts?.["start:web"]).toBeDefined();
    });

    it("has start:worker script", () => {
      const pkg = JSON.parse(
        readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
      ) as { scripts?: Record<string, string> };
      expect(pkg.scripts?.["start:worker"]).toBeDefined();
    });
  });
});
