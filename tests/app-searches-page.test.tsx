// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionModule from "../src/auth/session";

vi.mock("../src/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../src/auth/session")>(
    "../src/auth/session",
  );
  return {
    ...actual,
    getSessionFromRequest: vi.fn(),
  };
});

vi.mock("next/headers", () => {
  const obj = {
    headers: () => ({ forEach: () => undefined }),
    cookies: () => ({ toString: () => "" }),
  };
  return obj;
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

describe("Searches page", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "organizer@example.com",
        displayName: "Organizer",
        avatarUrl: null,
        shortBio: null,
        role: "organizer",
        status: "active",
        profileTimezone: null,
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token-organizer",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Search heading for an organizer", async () => {
    const { default: SearchesPage } = await import(
      "../app/(product)/searches/page"
    );
    const html = renderToString(await SearchesPage());
    expect(html).toContain("Search");
  });

  it("throws NEXT_NOT_FOUND when called by a plain user", async () => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: null,
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token-user",
    });
    const { default: SearchesPage } = await import(
      "../app/(product)/searches/page"
    );
    await expect(SearchesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
