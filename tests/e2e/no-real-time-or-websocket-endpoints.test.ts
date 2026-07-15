import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { GET as getSearchResultApi } from "../../app/api/searches/[id]/route";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const APP_ROOT = join(REPO_ROOT, "app");

async function listAppSourceFiles(root = APP_ROOT): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAppSourceFiles(filePath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(filePath);
    }
  }

  return files;
}

describe("E2E: no real-time or websocket transport exists", () => {
  it("does not define WebSocket or SSE transports in app source", async () => {
    const sourceFiles = await listAppSourceFiles();
    const routeFiles = sourceFiles.filter((filePath) =>
      filePath.endsWith("route.ts"),
    );

    expect(routeFiles.length).toBeGreaterThan(0);

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");

      expect(source).not.toMatch(/\bnew\s+(?:WebSocket|EventSource)\s*\(/);

      if (filePath.endsWith("route.ts")) {
        expect(source).not.toMatch(/text\/event-stream|new\s+ReadableStream/i);
        expect(source).not.toMatch(
          /(?:headers\.(?:set|append)|headers\s*:\s*{)[\s\S]{0,160}["'](?:upgrade|connection)["']/i,
        );
        expect(relative(APP_ROOT, filePath)).not.toMatch(
          /(?:^|[/\\])(?:websocket|ws|sse|stream)(?:[/\\]|\.route\.ts$)/i,
        );
      }
    }
  });

  it("keeps client interactions on HTTP JSON transport", async () => {
    const sourceFiles = await listAppSourceFiles();
    const clientFiles: string[] = [];

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      if (!source.startsWith('"use client"')) {
        continue;
      }

      clientFiles.push(filePath);
      expect(source).not.toMatch(
        /\bnew\s+(?:WebSocket|EventSource)\s*\(|\b(?:getReader|pipeThrough)\s*\(|text\/event-stream/i,
      );
    }

    expect(clientFiles.length).toBeGreaterThan(0);

    const searchPage = await readFile(
      join(APP_ROOT, "searches", "[id]", "page.tsx"),
      "utf8",
    );

    expect(searchPage).toMatch(/fetch\s*\([^)]*\/api\/searches\//);
    expect(searchPage).toMatch(/await\s+\w+\.json\s*\(\)/);
  });

  it("returns JSON from the Search Result API for upgrade-shaped requests", async () => {
    const response = await getSearchResultApi(
      new Request("http://localhost/api/searches/missing", {
        headers: {
          Accept: "text/event-stream",
          Connection: "Upgrade",
          Upgrade: "websocket",
        },
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/i);
    expect(response.headers.get("upgrade")).toBeNull();
    expect(response.headers.get("connection") ?? "").not.toMatch(
      /\bupgrade\b/i,
    );
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });
});
