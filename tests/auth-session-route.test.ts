import { describe, expect, it } from "vitest";

import { DELETE } from "../app/auth/session/route";

describe("DELETE /auth/session", () => {
  it("returns 302 redirect to app root", async () => {
    const response = await DELETE(
      new Request("http://localhost/auth/session", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost/");
  });

  it("clears session cookie on request without session cookie", async () => {
    const response = await DELETE(
      new Request("http://localhost/auth/session", {
        method: "DELETE",
      }),
    );

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("slotmerge_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("clears cookie even with tampered cookie", async () => {
    const response = await DELETE(
      new Request("http://localhost/auth/session", {
        method: "DELETE",
        headers: {
          Cookie: "slotmerge_session=invalid-tampered-value",
        },
      }),
    );

    expect(response.status).toBe(302);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("slotmerge_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

});