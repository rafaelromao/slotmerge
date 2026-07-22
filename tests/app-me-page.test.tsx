// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionModule from "../src/auth/session";
import {
  setProfileRepositoryForTests,
  type UserProfile,
} from "../src/profile/repository";

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

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-1",
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    avatarUrl: null,
    shortBio: null,
    role: "user",
    status: "active",
    profileTimezone: "America/New_York",
    bufferMinutes: 15,
    ...overrides,
  };
}

describe("/me (setup overview page)", () => {
  beforeEach(() => {
    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve(userId === "user-1" ? makeProfile() : null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 15,
      },
      csrfToken: "csrf-token-ada",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    setProfileRepositoryForTests(null);
  });

  it("renders the profile summary for an authed user with a link to /me/profile", async () => {
    const { default: ProfileOverviewPage } = await import(
      "../app/(product)/me/page"
    );
    const html = renderToString(await ProfileOverviewPage());

    expect(html).toContain("My Profile");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("/me/profile");
  });

  it("renders the email and timezone in the profile summary", async () => {
    setProfileRepositoryForTests({
      findByUserId: (userId) =>
        Promise.resolve(
          userId === "user-1"
            ? makeProfile({ profileTimezone: "America/New_York", bufferMinutes: 30 })
            : null,
        ),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    const { default: ProfileOverviewPage } = await import(
      "../app/(product)/me/page"
    );
    const html = renderToString(await ProfileOverviewPage());

    expect(html).toContain("ada@example.com");
    expect(html).toContain("America/New_York");
    // React splits adjacent text nodes with `<!-- -->` markers in SSR HTML,
    // so we check for the buffer-minutes marker and the value separately.
    expect(html).toMatch(/data-testid="profile-summary-buffer"[\s\S]*?30/);
    expect(html).toMatch(/data-testid="profile-summary-buffer"[\s\S]*?minutes/);
  });

  it("renders the not-found empty state when the profile cannot be loaded", async () => {
    setProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });

    const { default: ProfileOverviewPage } = await import(
      "../app/(product)/me/page"
    );
    const html = renderToString(await ProfileOverviewPage());

    expect(html).toContain("Profile not found");
  });
});
