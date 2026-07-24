// @vitest-environment happy-dom

import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccountView } from "../app/(product)/me/_components/DeleteAccountView";
import * as sessionModule from "../src/auth/session";

vi.mock("../src/auth/session", async () => {
  const actual = await vi.importActual<typeof import("../src/auth/session")>(
    "../src/auth/session",
  );
  return { ...actual, getSessionFromRequest: vi.fn() };
});

vi.mock("next/headers", () => ({
  headers: () => ({ forEach: () => undefined }),
  cookies: () => ({ toString: () => "" }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const BODY =
  "This removes your display name, profile, Topics, Availability, Discoverability, and Calendar Connections. You will not appear in Organizer Searches. Audit records that are not personal are kept. To delete, type DELETE below.";

describe("/me/delete", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-295",
        email: "delete@example.com",
        displayName: "Delete User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "UTC",
        bufferMinutes: 0,
      },
      csrfToken: "csrf-295",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the complete account-lifecycle confirmation surface in SSR HTML", () => {
    const html = renderToString(
      <DeleteAccountView csrfToken="csrf-295" error="confirm_required" />,
    );

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Delete your account");
    expect(html).toContain(BODY);
    expect(html).toContain("Type DELETE to confirm");
    expect(html).toContain("Delete my account");
    expect(html).toContain('href="/me"');
    expect(html).toContain("Cancel");
    expect(html).toContain('aria-live="polite"');
  });

  it("renders the authenticated page with allowlisted CSRF feedback", async () => {
    const { default: DeleteAccountPage } =
      await import("../app/(product)/me/delete/page");
    const html = renderToString(
      await DeleteAccountPage({
        searchParams: Promise.resolve({ error: "csrf" }),
      }),
    );

    expect(html).toContain("delete-account-csrf-error");
    expect(html).toContain("csrf-295");
    expect(html).toContain("Your request could not be verified");
  });
});
