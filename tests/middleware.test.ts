import { describe, expect, it } from "vitest";

import { middleware } from "../middleware";

describe("middleware session-redirect gate", () => {
  it("redirects unauthenticated GET /admin to /sign-in?returnTo=%2Fadmin with status 303", () => {
    const response = middleware({
      nextUrl: new URL("http://localhost:3000/admin"),
      url: "http://localhost:3000/admin",
      method: "GET",
      headers: new Headers(),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof middleware>[0]);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/sign-in?returnTo=%2Fadmin",
    );
  });

  it("does NOT redirect an unauthenticated POST to /me/calendar-connections/callback (the canonical cross-site OAuth verb)", () => {
    const response = middleware({
      nextUrl: new URL(
        "http://localhost:3000/me/calendar-connections/callback",
      ),
      url: "http://localhost:3000/me/calendar-connections/callback",
      method: "POST",
      headers: new Headers(),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof middleware>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("passes an unauthenticated GET /me/calendar-connections/callback through to the route handler so the handler can render its rejection copy", () => {
    const response = middleware({
      nextUrl: new URL(
        "http://localhost:3000/me/calendar-connections/callback",
      ),
      url: "http://localhost:3000/me/calendar-connections/callback",
      method: "GET",
      headers: new Headers(),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof middleware>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("still protects /me and /searches from unauthenticated GET", () => {
    const me = middleware({
      nextUrl: new URL("http://localhost:3000/me"),
      url: "http://localhost:3000/me",
      method: "GET",
      headers: new Headers(),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof middleware>[0]);
    expect(me.status).toBe(303);

    const searches = middleware({
      nextUrl: new URL("http://localhost:3000/searches"),
      url: "http://localhost:3000/searches",
      method: "GET",
      headers: new Headers(),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof middleware>[0]);
    expect(searches.status).toBe(303);
  });

  it("does not redirect GET /api/v1/searches", () => {
    const response = middleware({
      nextUrl: new URL("http://localhost:3000/api/v1/searches"),
      url: "http://localhost:3000/api/v1/searches",
      method: "GET",
      headers: new Headers(),
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof middleware>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });
});
