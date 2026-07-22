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

vi.mock("next/headers", () => ({
  cookies: async () => {
    await Promise.resolve();
    return {
      toString: () => "slotmerge_session=dummy",
      entries: () => [] as never,
      get: () => undefined,
      forEach: () => undefined,
    };
  },
  headers: async () => {
    await Promise.resolve();
    return {
      entries: () => [] as never,
      get: () => undefined,
      forEach: () => undefined,
    };
  },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("Admin page", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        displayName: "Carol Admin",
        avatarUrl: null,
        shortBio: null,
        role: "admin",
        status: "active",
        profileTimezone: null,
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token-admin",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Admin shell heading for an admin", async () => {
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    const html = renderToString(await AdminPage());
    expect(html).toContain("Admin");
  });

  it("throws NEXT_NOT_FOUND when called by a non-admin", async () => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Alice User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: null,
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token-user",
    });
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
