import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "../app/auth/session/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";

describe("DELETE /auth/session", () => {
  afterEach(() => {
    setSessionRepositoryForTests(null);
  });

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

  it("invokes sessionRepository.delete with correct sessionId", async () => {
    const deleteMock = vi.fn();

    setSessionRepositoryForTests({
      findById: vi.fn(),
      delete: deleteMock,
    });

    const cookie = await sealSessionCookie({ sessionId: "session-1" });

    const response = await DELETE(
      new Request("http://localhost/auth/session", {
        method: "DELETE",
        headers: {
          Cookie: cookie,
        },
      }),
    );

    expect(response.status).toBe(302);
    expect(deleteMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledWith("session-1");
  });
});
