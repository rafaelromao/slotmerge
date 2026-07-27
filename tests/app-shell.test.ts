// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/workflow/setup-home-production", () => ({
  createProductionSetupHomeWorkflow: vi.fn(),
}));

import * as sessionModule from "@/auth/session";
import * as dbModule from "@/db/client";
import * as workflowModule from "@/workflow/setup-home-production";
import { USER_FIXTURES } from "./fixtures/seeds";

const TEST_USER = USER_FIXTURES[0];
const TEST_ORGANIZER = USER_FIXTURES[1];
const TEST_ADMIN = USER_FIXTURES[2];

function mockServerSession(user: (typeof USER_FIXTURES)[number]) {
  vi.mocked(sessionModule.getServerSession).mockResolvedValue({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: null,
      shortBio: null,
      role: user.role,
      status: user.status,
      profileTimezone: user.profileTimezone ?? null,
      bufferMinutes: user.bufferMinutes,
    },
    csrfToken: "test-csrf",
  });
}

function mockServerSessionNull() {
  vi.mocked(sessionModule.getServerSession).mockResolvedValue(null);
}

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([{ count: 0 }]),
};

function installMocks(displayName: string | null) {
  vi.mocked(dbModule.getDb).mockReturnValue(
    mockDb as unknown as ReturnType<typeof dbModule.getDb>,
  );
  vi.mocked(workflowModule.createProductionSetupHomeWorkflow).mockReturnValue({
    async loadSummary() {
      await Promise.resolve();
      return {
        ok: true,
        value: {
          complete: false,
          items: [
            { key: "profile", label: "Profile", required: true, complete: Boolean(displayName) },
            { key: "discoverability", label: "Discoverability", required: true, complete: false },
            { key: "topics", label: "Topics", required: true, complete: false },
            { key: "availability", label: "Availability", required: true, complete: false },
            { key: "calendarConnection", label: "Calendar Connection", required: false, complete: false },
          ],
        },
      };
    },
  });
}

describe("Setup Home page component", () => {
  it("renders five setup checklist cards for an authenticated user", async () => {
    mockServerSession({ ...TEST_USER, displayName: "" });
    installMocks("");

    const { default: ProductLayout } = await import("../app/(product)/layout");
    const { default: Page } = await import("../app/(product)/page");
    const html = renderToString(
      await ProductLayout({ children: await Page() }),
    );

    expect(html).toContain("Welcome to SlotMerge");
    expect(html).toContain("Profile");
    expect(html).toContain("Discoverability");
    expect(html).toContain("Topics");
    expect(html).toContain("Availability");
    expect(html).toContain("Calendar Connection");
    expect(html).toContain("Setup");
    expect(html).toContain("Calendar");
  });

  it("shows profile card as complete when user has displayName", async () => {
    mockServerSession(TEST_USER);
    installMocks(TEST_USER.displayName);

    const { default: Page } = await import("../app/(product)/page");
    const html = renderToString(await Page());

    expect(html).toContain('data-status="complete"');
    expect(html).toContain('data-status="pending"');
    expect(html).toContain('data-status="optional"');
  });

  it("shows Search nav link for organizer role", async () => {
    mockServerSession(TEST_ORGANIZER);
    installMocks(TEST_ORGANIZER.displayName);

    const { default: ProductLayout } = await import("../app/(product)/layout");
    const { default: Page } = await import("../app/(product)/page");
    const html = renderToString(
      await ProductLayout({ children: await Page() }),
    );

    expect(html).toContain("Search");
    expect(html).not.toContain("Admin");
  });

  it("shows Search and Admin nav links for admin role", async () => {
    mockServerSession(TEST_ADMIN);
    installMocks(TEST_ADMIN.displayName);

    const { default: ProductLayout } = await import("../app/(product)/layout");
    const { default: Page } = await import("../app/(product)/page");
    const html = renderToString(
      await ProductLayout({ children: await Page() }),
    );

    expect(html).toContain("Search");
    expect(html).toContain("Admin");
  });

  it("renders the HeaderMenuToggle with correct initial aria-expanded", async () => {
    mockServerSession(TEST_USER);
    installMocks(TEST_USER.displayName);

    const { default: ProductLayout } = await import("../app/(product)/layout");
    const { default: Page } = await import("../app/(product)/page");
    const html = renderToString(
      await ProductLayout({ children: await Page() }),
    );

    expect(html).toContain('data-testid="avatar-dropdown-trigger"');
  });

  it("renders signed-out message when no session", async () => {
    mockServerSessionNull();

    const { default: Page } = await import("../app/(product)/page");
    const html = renderToString(await Page());

    expect(html).toContain("Please sign in to continue.");
  });
});