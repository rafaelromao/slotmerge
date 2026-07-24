import { describe, expect, it } from "vitest";

describe("legacy admin topics redirect", () => {
  it("redirects /admin/topics to /admin#topics with deprecation headers", async () => {
    const { GET } = await import("./route");
    const response = GET();
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/admin#topics");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toMatch(/^[A-Z][a-z]{2}, /);
    expect(response.headers.get("Link")).toBe(
      '</admin#topics>; rel="successor-version"',
    );
  });

  it("redirects POST /admin/topics to /admin#topics with deprecation headers", async () => {
    const { POST } = await import("./route");
    const response = POST();
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/admin#topics");
    expect(response.headers.get("Deprecation")).toBe("true");
  });
});
