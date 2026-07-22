import { describe, expect, it } from "vitest";

import { legacyRedirect } from "./legacy-redirect";

const SUNSET = new Date("2026-12-31T23:59:59.000Z");

describe("legacyRedirect", () => {
  it("returns a 308 response with the relocation Location header", () => {
    const response = legacyRedirect({
      target: "/api/v1/searches/abc",
      sunset: SUNSET,
    });

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/api/v1/searches/abc");
  });

  it("includes a Deprecation header set to true", () => {
    const response = legacyRedirect({
      target: "/api/v1/searches",
      sunset: SUNSET,
    });

    expect(response.headers.get("Deprecation")).toBe("true");
  });

  it("includes a Sunset header formatted as an HTTP date", () => {
    const response = legacyRedirect({
      target: "/api/v1/searches",
      sunset: SUNSET,
    });

    expect(response.headers.get("Sunset")).toBe("Thu, 31 Dec 2026 23:59:59 GMT");
  });

  it("includes a Link header with rel=\"successor-version\"", () => {
    const response = legacyRedirect({
      target: "/api/v1/searches/123",
      sunset: SUNSET,
    });

    expect(response.headers.get("Link")).toBe(
      "</api/v1/searches/123>; rel=\"successor-version\"",
    );
  });

  it("uses a fragment-aware target in the Link header", () => {
    const response = legacyRedirect({
      target: "/admin#users",
      sunset: SUNSET,
    });

    expect(response.headers.get("Link")).toBe(
      "</admin#users>; rel=\"successor-version\"",
    );
    expect(response.headers.get("Location")).toBe("/admin#users");
  });
});
