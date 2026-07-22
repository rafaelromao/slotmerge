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
    const error = new Error("NEXT_NOT_FOUND");
    (error as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw error;
  },
  redirect: (url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as Error & { digest?: string }).digest = `NEXT_REDIRECT;303;${url};`;
    throw error;
  },
}));

vi.mock("../src/admin/users.workflow", () => ({
  createAdminUsersWorkflow: vi.fn(() => ({
    load: vi.fn().mockResolvedValue({ users: [], recentInvites: [] }),
  })),
}));

vi.mock("../src/admin/topics.workflow", () => ({
  createAdminTopicsWorkflow: vi.fn(() => ({
    load: vi.fn().mockResolvedValue({ activeTopics: [] }),
  })),
}));

vi.mock("../src/admin/operational-status.workflow", () => ({
  createAdminStatusWorkflow: vi.fn(() => ({
    load: vi.fn().mockResolvedValue({
      email: {
        since: new Date(),
        counts: { queued: 0, sending: 0, sent: 0, failed: 0 },
        recentFailures: [],
      },
      calendar: {
        counts: { pending: 0, connected: 0, disconnected: 0 },
        tokensNeedingRefresh: [],
      },
      windowHours: 24,
      generatedAt: new Date("2026-07-12T12:00:00.000Z"),
    }),
  })),
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

  it("renders three collapsible sections with Users open by default", async () => {
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    const html = renderToString(await AdminPage());
    expect(html).toContain("Users");
    expect(html).toContain("Topics");
    expect(html).toContain("Status");
    expect(html).toMatch(/<details[^>]*open[^>]*>\s*<summary[^>]*data-testid="admin-users-summary"/);
    expect(html).toContain('data-testid="admin-topics-summary"');
    expect(html).toContain('data-testid="admin-status-summary"');
  });

  it("renders the one-line summary for the Topics and Status sections", async () => {
    const { createAdminTopicsWorkflow } = await import(
      "../src/admin/topics.workflow"
    );
    const { createAdminStatusWorkflow } = await import(
      "../src/admin/operational-status.workflow"
    );
    vi.mocked(createAdminTopicsWorkflow).mockReturnValue({
      load: vi.fn().mockResolvedValue({
        activeTopics: [
          { id: "t-1", name: "Topic One", status: "active", retiredAt: null, createdAt: new Date() },
          { id: "t-2", name: "Topic Two", status: "active", retiredAt: null, createdAt: new Date() },
        ],
      }),
    });
    vi.mocked(createAdminStatusWorkflow).mockReturnValue({
      load: vi.fn().mockResolvedValue({
        email: {
          since: new Date(),
          counts: { queued: 0, sending: 0, sent: 0, failed: 3 },
          recentFailures: [],
        },
        calendar: {
          counts: { pending: 1, connected: 2, disconnected: 0 },
          tokensNeedingRefresh: [],
        },
        windowHours: 24,
        generatedAt: new Date("2026-07-12T12:00:00.000Z"),
      }),
    });

    const { default: AdminPage } = await import("../app/(product)/admin/page");
    const html = renderToString(await AdminPage());
    expect(html).toMatch(/2<!-- --> active topic<!-- -->s/);
    expect(html).toMatch(/3<!-- --> email failures in the last<!-- --> <!-- -->24<!-- -->h/);
    expect(html).toMatch(/3<!-- --> calendar connection<!-- -->s/);
  });

  it("renders the masked-email banner when ?invited=<masked> is supplied", async () => {
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    const html = renderToString(
      await AdminPage({ searchParams: Promise.resolve({ invited: "ab***@example.com" }) }),
    );
    expect(html).toMatch(/Invitation sent to <!-- -->ab\*\*\*@example\.com<!-- -->\./);
    expect(html).toContain('data-testid="invite-banner"');
  });

  it("does not render the banner when no ?invited query param is supplied", async () => {
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    const html = renderToString(await AdminPage());
    expect(html).not.toContain("data-testid=\"invite-banner\"");
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

  it("redirects when there is no session", async () => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue(null);
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    let message = "";
    try {
      await AdminPage();
    } catch (error) {
      message = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(message).toContain("NEXT_REDIRECT");
    expect(decodeURIComponent(message)).toContain("/sign-in");
  });

  it("redirects when the session is suspended", async () => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Alice User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "suspended",
        profileTimezone: null,
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token-user",
    });
    const { default: AdminPage } = await import("../app/(product)/admin/page");
    let message = "";
    try {
      await AdminPage();
    } catch (error) {
      message = (error as Error & { digest?: string }).digest ?? "";
    }
    expect(message).toContain("NEXT_REDIRECT");
    expect(decodeURIComponent(message)).toContain("/sign-in");
  });
});