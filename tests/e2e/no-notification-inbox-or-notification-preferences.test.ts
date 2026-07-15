import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

async function listAppFolders(root = APP_ROOT): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const folders: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      folders.push(join(root, entry.name));
    }
  }

  return folders;
}

describe("E2E: no notification inbox or notification preferences exist", () => {
  it("has a non-empty app source tree to scan", async () => {
    const sourceFiles = await listAppSourceFiles();
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("does not define a notification inbox route in app/", async () => {
    const folders = await listAppFolders();
    const notificationFolders = folders.filter((folder) =>
      /(?:^|[/\\])notifications?(?:[/\\]|$)/i.test(folder),
    );
    expect(notificationFolders).toHaveLength(0);
  });

  it("does not define a notification preferences endpoint in app source", async () => {
    const sourceFiles = await listAppSourceFiles();
    const routeFiles = sourceFiles.filter((filePath) =>
      filePath.endsWith("route.ts"),
    );

    expect(routeFiles.length).toBeGreaterThan(0);

    const notificationRoutes = routeFiles.filter((filePath) =>
      /(?:^|[/\\])notification/i.test(filePath),
    );
    expect(notificationRoutes).toHaveLength(0);
  });

  it("does not reference notification preferences or inbox in app source", async () => {
    const sourceFiles = await listAppSourceFiles();

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      expect(source).not.toMatch(
        /\bnotification(?:[-]?(?:preferences?|inbox|centre|center))?\b/i,
      );
    }
  });
});
