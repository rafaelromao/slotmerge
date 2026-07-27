import { describe, expect, it } from "vitest";

import { problemJson } from "./problem-json";

describe("problemJson", () => {
  it("emits an RFC 7807 body with the application/problem+json content type", async () => {
    const response = problemJson(404, {
      title: "Search not found",
      detail: "No Search with that id is available.",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "application/problem+json",
    );

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      type: "about:blank",
      title: "Search not found",
      status: 404,
      detail: "No Search with that id is available.",
    });
  });

  it("defaults the type to about:blank and omits the detail when not provided", async () => {
    const response = problemJson(403, { title: "Forbidden" });

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
    });
    expect(body).not.toHaveProperty("detail");
  });

  it("honors a custom type when one is provided", async () => {
    const response = problemJson(401, {
      type: "/problems/unauthenticated",
      title: "Sign in required",
    });

    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      type: "/problems/unauthenticated",
      title: "Sign in required",
      status: 401,
    });
  });
});
