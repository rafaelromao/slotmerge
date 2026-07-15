import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const APP_ROOT = join(REPO_ROOT, "app");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type RouteModule = Record<string, unknown>;
type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Response | Promise<Response>;

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

async function listRouteFiles(): Promise<string[]> {
  const sourceFiles = await listAppSourceFiles();
  return sourceFiles.filter((filePath) => filePath.endsWith("route.ts"));
}

function requestForRoute(filePath: string, method: string): Request {
  const routePath = relative(APP_ROOT, filePath)
    .replace(/[/\\]route\.ts$/, "")
    .split(/[\\/]/)
    .map((segment) => (segment.startsWith("[") ? "missing" : segment))
    .join("/");
  const hasBody = method !== "GET";
  const isFormEncoded =
    routePath.endsWith("calendar-connections/callback") ||
    routePath.endsWith("auth/magic-link/request") ||
    routePath.endsWith("auth/magic-link/resend") ||
    routePath.endsWith("auth/magic-link/verify");

  return new Request(`http://localhost/${routePath}`, {
    method,
    headers: {
      Accept: "text/event-stream",
      Connection: "Upgrade",
      Upgrade: "websocket",
      ...(hasBody
        ? {
            "Content-Type": isFormEncoded
              ? "application/x-www-form-urlencoded"
              : "application/json",
          }
        : {}),
    },
    ...(hasBody ? { body: isFormEncoded ? new URLSearchParams() : "{}" } : {}),
  });
}

describe("E2E: no real-time or websocket transport exists", () => {
  it("does not define WebSocket or SSE transports in app source", async () => {
    const sourceFiles = await listAppSourceFiles();

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");

      expect(source).not.toMatch(/\bnew\s+(?:WebSocket|EventSource)\s*\(/);

      if (filePath.endsWith("route.ts")) {
        expect(source).not.toMatch(
          /text\/event-stream|ReadableStream|\bupgrade\b|connection\s*:\s*["']upgrade["']/i,
        );
        expect(relative(APP_ROOT, filePath)).not.toMatch(
          /(?:^|[/\\])(?:websocket|ws|sse|stream)(?:[/\\]|\.route\.ts$)/i,
        );
      }
    }
  });

  it("uses the HTTP JSON API for Search Result client data", async () => {
    const source = await readFile(
      join(APP_ROOT, "searches", "[id]", "page.tsx"),
      "utf8",
    );

    expect(source).toContain("fetch(`/api/searches/${searchId}`)");
    expect(source).toContain("await res.json()");
    expect(source).not.toMatch(/\bnew\s+(?:WebSocket|EventSource)\s*\(/);
    expect(source).not.toMatch(/\b(?:getReader|pipeThrough)\s*\(/);
    expect(source).not.toMatch(/text\/event-stream|\bupgrade\b/i);
  });

  it("returns ordinary HTTP responses from every route handler", async () => {
    for (const filePath of await listRouteFiles()) {
      const routeModule = (await import(
        pathToFileURL(filePath).href
      )) as RouteModule;

      for (const method of HTTP_METHODS) {
        const candidate = routeModule[method];
        if (typeof candidate !== "function") {
          continue;
        }

        const handler = candidate as RouteHandler;
        let response: Response;
        try {
          response = await handler(requestForRoute(filePath, method), {
            params: Promise.resolve({ id: "missing", connectionId: "missing" }),
          });
        } catch (error) {
          throw new Error(
            `${relative(APP_ROOT, filePath)} ${method}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const contentType = response.headers.get("content-type") ?? "";
        const connection = response.headers.get("connection") ?? "";

        expect(response.status).not.toBe(101);
        expect(contentType).not.toMatch(/^text\/event-stream\b/i);
        expect(response.headers.get("upgrade")).toBeNull();
        expect(connection).not.toMatch(/\bupgrade\b/i);
        await response.text();
      }
    }
  });

  it("uses no WebSocket or SSE transport dependency", async () => {
    const packageJson = JSON.parse(
      await readFile(join(REPO_ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencyNames = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });
    const realtimeDependencies = [
      "@fastify/websocket",
      "eventsource",
      "graphql-ws",
      "socket.io",
      "socket.io-client",
      "sse",
      "ws",
    ];

    expect(
      dependencyNames.filter((name) => realtimeDependencies.includes(name)),
    ).toEqual([]);
  });
});
