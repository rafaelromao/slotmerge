import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const APPCLOCK_ALLOWLIST = new Set([
  "src/system/clock.ts",
  "src/system/random.ts",
  "src/system/index.ts",
  "src/worker/run.ts",
]);

const NEXTJS_BOUNDARY_PREFIXES = [
  "app/admin",
  "app/api",
  "app/auth",
  "app/me",
  "app/topics",
  "app/topic-proposals",
  "app/(product)",
  "src/lib",
  "src/worker",
];

const SCAN_ROOTS = ["src", "app"];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

const SCAN_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".sandman",
  "drizzle",
  "playwright",
  "tests",
  "docs",
  "dist",
  "build",
  "coverage",
]);

const NEW_DATE_NO_ARGS = /\bnew\s+Date\s*\(\s*\)/g;
const DATE_NOW_CALL = /\bDate\.now\s*\(/g;
const MATH_RANDOM_CALL = /\bMath\.random\s*\(/g;
const SYSTEM_CLOCK_DEFAULT = /=\s*systemClock(?:Boundary)?\s*\(/g;
const SYSTEM_CLOCK_BOUNDARY_CONST =
  /\bconst\s+systemClockBoundary\s*=\s*systemClock\s*\(/g;
const SYSTEM_CLOCK_CALL = /\bsystemClock\s*\(/g;
const SYSTEM_RANDOM_SOURCE_CALL = /\bsystemRandomSource\s*\(/g;

type Violation = {
  file: string;
  line: number;
  rule: string;
  match: string;
};

function isInsideNextJsBoundary(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  for (const prefix of NEXTJS_BOUNDARY_PREFIXES) {
    if (normalized.startsWith(`${prefix}/`) || normalized === prefix) {
      return true;
    }
  }
  return false;
}

function isProductionSource(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  if (path.basename(normalized).endsWith(".test.ts")) return false;
  if (path.basename(normalized).endsWith(".test.tsx")) return false;
  return true;
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await readdir(dir, {
        withFileTypes: true,
      });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryName: string = String(entry.name);
      const full = path.join(dir, entryName);
      if (typeof entry.isDirectory === "function" && entry.isDirectory()) {
        if (SCAN_EXCLUDE_DIRS.has(entryName)) continue;
        await walk(full);
      } else {
        const ext = path.extname(entryName);
        if (SCAN_EXTENSIONS.has(ext)) {
          out.push(full);
        }
      }
    }
  }
  await walk(root);
  return out;
}

async function scanFile(file: string): Promise<Violation[]> {
  const normalized = file.replace(/\\/g, "/");
  if (APPCLOCK_ALLOWLIST.has(normalized)) return [];
  const isBoundary = isInsideNextJsBoundary(normalized);
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";

    let match: RegExpExecArray | null;
    NEW_DATE_NO_ARGS.lastIndex = 0;
    while ((match = NEW_DATE_NO_ARGS.exec(line)) !== null) {
      if (isBoundary) continue;
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-new-date-no-args",
        match: match[0],
      });
    }

    DATE_NOW_CALL.lastIndex = 0;
    while ((match = DATE_NOW_CALL.exec(line)) !== null) {
      if (isBoundary) continue;
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-date-now",
        match: match[0],
      });
    }

    MATH_RANDOM_CALL.lastIndex = 0;
    while ((match = MATH_RANDOM_CALL.exec(line)) !== null) {
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-math-random",
        match: match[0],
      });
    }

    SYSTEM_CLOCK_DEFAULT.lastIndex = 0;
    while ((match = SYSTEM_CLOCK_DEFAULT.exec(line)) !== null) {
      if (isBoundary) continue;
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-system-clock-default",
        match: match[0],
      });
    }

    SYSTEM_CLOCK_BOUNDARY_CONST.lastIndex = 0;
    while ((match = SYSTEM_CLOCK_BOUNDARY_CONST.exec(line)) !== null) {
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-system-clock-boundary-const",
        match: match[0],
      });
    }

    SYSTEM_CLOCK_CALL.lastIndex = 0;
    while ((match = SYSTEM_CLOCK_CALL.exec(line)) !== null) {
      // Allow `systemClock()` declaration line and typed imports (rare)
      // We flag any other call site in core code.
      if (isBoundary) continue;
      // Skip the function definition itself (`export function systemClock(): Clock {`).
      if (
        /export\s+function\s+systemClock\b/.test(line) ||
        /\bsystemClock\.now\s*\(/.test(line)
      ) {
        continue;
      }
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-system-clock-call",
        match: match[0],
      });
    }

    SYSTEM_RANDOM_SOURCE_CALL.lastIndex = 0;
    while ((match = SYSTEM_RANDOM_SOURCE_CALL.exec(line)) !== null) {
      if (isBoundary) continue;
      if (
        /export\s+function\s+systemRandomSource\b/.test(line) ||
        /\bsystemRandomSource\.next\s*\(/.test(line)
      ) {
        continue;
      }
      violations.push({
        file: normalized,
        line: i + 1,
        rule: "no-system-random-source-call",
        match: match[0],
      });
    }
  }

  return violations;
}

async function collectViolations(): Promise<Violation[]> {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    files.push(...(await listFiles(root)));
  }
  const all: Violation[] = [];
  for (const file of files) {
    if (!isProductionSource(file)) continue;
    const violations = await scanFile(file);
    all.push(...violations);
  }
  return all;
}

describe("AppClock boundary ownership migration", () => {
  it("scans production source files and reports the deny-list coverage", async () => {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) {
      files.push(...(await listFiles(root)));
    }
    const productionFiles = files.filter(isProductionSource);
    expect(productionFiles.length).toBeGreaterThan(0);
  });

  it("allows wall-clock primitives only inside the AppClock boundary allowlist", async () => {
    const violations = await collectViolations();
    if (violations.length > 0) {
      const summary = violations
        .slice(0, 25)
        .map((v) => `  ${v.file}:${v.line}  [${v.rule}]  ${v.match}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} AppClock boundary violation(s):\n${summary}${
          violations.length > 25 ? "\n  ... (truncated)" : ""
        }`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("scopes the allowlist to the four approved boundary files", () => {
    expect(APPCLOCK_ALLOWLIST.has("src/system/clock.ts")).toBe(true);
    expect(APPCLOCK_ALLOWLIST.has("src/system/random.ts")).toBe(true);
    expect(APPCLOCK_ALLOWLIST.has("src/system/index.ts")).toBe(true);
    expect(APPCLOCK_ALLOWLIST.has("src/worker/run.ts")).toBe(true);
  });

  it("recognizes the Next.js boundary directories for entry-point exceptions", () => {
    expect(isInsideNextJsBoundary("app/admin/invites/route.ts")).toBe(true);
    expect(isInsideNextJsBoundary("app/api/v1/searches/route.ts")).toBe(true);
    expect(isInsideNextJsBoundary("app/me/availability/page.tsx")).toBe(true);
    expect(isInsideNextJsBoundary("app/topics/route.ts")).toBe(true);
    expect(isInsideNextJsBoundary("app/(product)/me/topics/page.tsx")).toBe(
      true,
    );
    expect(isInsideNextJsBoundary("src/admin/users.ts")).toBe(false);
    expect(isInsideNextJsBoundary("src/calendar/connection.ts")).toBe(false);
  });
});
