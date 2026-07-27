import { describe, expect, it } from "vitest";

describe("legacy admin status redirect", () => {
  it("redirects /admin/status to /admin#status with deprecation headers", async () => {
    const { GET } = await import("./route");
    const response = GET();
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/admin#status");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toMatch(/^[A-Z][a-z]{2}, /);
    expect(response.headers.get("Link")).toBe(
      '</admin#status>; rel="successor-version"',
    );
  });
});
