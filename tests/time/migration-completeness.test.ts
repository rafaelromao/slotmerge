import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

type SourceFile = { path: string; content: string };

function listFiles(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFiles(full, ext));
    } else if (ext.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function readSourceFiles(dirs: string[]): SourceFile[] {
  const files: SourceFile[] = [];
  for (const dir of dirs) {
    const abs = join(REPO_ROOT, dir);
    let entries: string[];
    try {
      entries = listFiles(abs, [".ts", ".tsx"]);
    } catch {
      continue;
    }
    for (const file of entries) {
      const content = readFileSync(file, "utf-8");
      files.push({ path: relative(REPO_ROOT, file), content });
    }
  }
  return files;
}

const APP_DIRS = ["app"];
const SRC_DIRS = ["src"];
const LOCAL_TIME_MODULE = "src/time/local-time.ts";

describe("migration completeness (issue #259)", () => {
  const allFiles = readSourceFiles([...APP_DIRS, ...SRC_DIRS]);
  const appFiles = allFiles.filter((f) => f.path.startsWith("app/"));
  const srcFiles = allFiles.filter((f) => f.path.startsWith("src/"));

  it("no app file imports from the deleted src/search/timezone path", () => {
    const offenders = appFiles.filter((f) =>
      /from\s+["'][^"']*src\/search\/timezone["']/.test(f.content),
    );
    expect(offenders).toEqual([]);
  });

  it("no src/search/* file imports the deleted sibling ./timezone", () => {
    const offenders = srcFiles
      .filter((f) => f.path.startsWith("src/search/"))
      .filter((f) =>
        /from\s+["']\.\/timezone["']/.test(f.content),
      );
    expect(offenders).toEqual([]);
  });

  it("no toUtcDateForTimezone exists outside src/time/local-time.ts", () => {
    const offenders = allFiles
      .filter((f) => f.path !== LOCAL_TIME_MODULE)
      .filter((f) => /\btoUtcDateForTimezone\b/.test(f.content));
    expect(offenders).toEqual([]);
  });

  it("no getLocalDayOfWeekAtNoon exists anywhere", () => {
    const offenders = allFiles.filter((f) =>
      /\bgetLocalDayOfWeekAtNoon\b/.test(f.content),
    );
    expect(offenders).toEqual([]);
  });

  it("no src/profile or src/matching file uses the host-local Date constructor pattern in math helpers", () => {
    const offenders = srcFiles
      .filter(
        (f) =>
          f.path.startsWith("src/profile/") ||
          f.path.startsWith("src/matching/"),
      )
      .filter((f) =>
        /new\s+Date\(\s*[a-zA-Z_]\w*\s*,\s*[a-zA-Z_]\w*\s*,\s*[a-zA-Z_]\w*\s*,\s*[a-zA-Z_]\w*\s*,\s*[a-zA-Z_]\w*\s*\)/.test(
          f.content,
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("the deleted module src/search/timezone.ts is gone", () => {
    const offenders = srcFiles.filter(
      (f) => f.path === "src/search/timezone.ts",
    );
    expect(offenders).toEqual([]);
  });
});
