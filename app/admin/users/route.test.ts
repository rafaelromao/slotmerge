import { describe, expect, it } from "vitest";

describe("legacy admin redirects", () => {
  it("redirects /admin/users to /admin#users with deprecation headers", async () => {
    const { GET } = await import("./route");
    const response = GET();
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/admin#users");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toMatch(/^[A-Z][a-z]{2}, /);
    expect(response.headers.get("Link")).toBe(
      '</admin#users>; rel="successor-version"',
    );
  });

  it("redirects POST /admin/users to /admin#users with deprecation headers", async () => {
    const { POST } = await import("./route");
    const response = POST();
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/admin#users");
    expect(response.headers.get("Deprecation")).toBe("true");
  });
});
