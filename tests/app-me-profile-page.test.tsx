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
    avatarUrl: "https://example.com/ada.png",
    shortBio: "Computing pioneer",
    role: "user",
    status: "active",
    profileTimezone: "America/New_York",
    bufferMinutes: 15,
    ...overrides,
  };
}

describe("/me/profile (profile edit page)", () => {
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

  it("renders the form pre-filled with current values and a Save button", async () => {
    const { default: ProfileEditPage } = await import(
      "../app/(product)/me/profile/page"
    );
    const html = renderToString(await ProfileEditPage({}));

    expect(html).toContain("Edit profile");
    expect(html).toContain("Ada Lovelace");
    expect(html).toMatch(/<option value="America\/New_York" selected="">/);
    expect(html).toMatch(/name="displayName"/);
    expect(html).toMatch(/name="profileTimezone"/);
    expect(html).toMatch(/name="bufferMinutes"/);
    expect(html).toMatch(/name="avatarUrl"/);
    expect(html).toMatch(/name="shortBio"/);
    expect(html).toContain("profile-save-button");
    expect(html).toContain("Save");
  });

  it("renders the email field as read-only with the user's email", async () => {
    const { default: ProfileEditPage } = await import(
      "../app/(product)/me/profile/page"
    );
    const html = renderToString(await ProfileEditPage({}));

    expect(html).toContain("ada@example.com");
    expect(html).toContain("aria-readonly=\"true\"");
    expect(html).toMatch(/<input[^>]*name="email"[^>]*>/i);
    expect(html).toMatch(/<input[^>]*readonly[^>]*name="email"[^>]*>/i);
  });

  it("does not show the Saved indicator when searchParams.saved is absent", async () => {
    const { default: ProfileEditPage } = await import(
      "../app/(product)/me/profile/page"
    );
    const html = renderToString(await ProfileEditPage({}));

    expect(html).not.toContain("profile-saved-indicator");
  });

  it("shows the Saved indicator when searchParams.saved === '1'", async () => {
    const { default: ProfileEditPage } = await import(
      "../app/(product)/me/profile/page"
    );
    const html = renderToString(await ProfileEditPage({
      searchParams: Promise.resolve({ saved: "1" }),
    }));

    expect(html).toContain("profile-saved-indicator");
    expect(html).toContain("Saved");
  });

  it("renders the empty state when the profile cannot be loaded", async () => {
    setProfileRepositoryForTests({
      findByUserId: () => Promise.resolve(null),
      updateByUserId: () => Promise.resolve(null),
      deleteByUserId: () => Promise.resolve(false),
    });
    const { default: ProfileEditPage } = await import(
      "../app/(product)/me/profile/page"
    );
    const html = renderToString(await ProfileEditPage({}));

    expect(html).toContain("profile-empty");
  });
});
