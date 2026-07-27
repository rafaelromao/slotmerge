// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/workflow/setup-home-production", () => ({
  createProductionSetupHomeWorkflow: vi.fn(),
}));

import * as sessionModule from "@/auth/session";
import * as workflowModule from "@/workflow/setup-home-production";

function buildSession(displayName: string | null, role: "user" | "organizer" = "user") {
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "user@example.com",
      displayName,
      avatarUrl: null,
      shortBio: null,
      role,
      status: "active" as const,
      profileTimezone: "UTC",
      bufferMinutes: 5,
    },
    csrfToken: "test-csrf",
  };
}

const SUMMARY_PENDING = {
  complete: false,
  items: [
    { key: "profile", label: "Profile", required: true, complete: false },
    { key: "discoverability", label: "Discoverability", required: true, complete: false },
    { key: "topics", label: "Topics", required: true, complete: false },
    { key: "availability", label: "Availability", required: true, complete: false },
    { key: "calendarConnection", label: "Calendar Connection", required: false, complete: false },
  ],
};

const SUMMARY_COMPLETE = {
  complete: true,
  items: [
    { key: "profile", label: "Profile", required: true, complete: true },
    { key: "discoverability", label: "Discoverability", required: true, complete: true },
    { key: "topics", label: "Topics", required: true, complete: true },
    { key: "availability", label: "Availability", required: true, complete: true },
    { key: "calendarConnection", label: "Calendar Connection", required: false, complete: true },
  ],
};

describe("Setup Home page (setupHomeWorkflow driven)", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getServerSession).mockReset();
    vi.mocked(workflowModule.createProductionSetupHomeWorkflow).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the five canonical card titles in order", async () => {
    vi.mocked(sessionModule.getServerSession).mockResolvedValue(buildSession(null));
    vi.mocked(workflowModule.createProductionSetupHomeWorkflow).mockReturnValue({
      async loadSummary() {
        await Promise.resolve();
        return SUMMARY_PENDING;
      },
    });

    const { default: Page } = await import("@/../app/(product)/page");
    const html = renderToString(await Page());

    const profileIndex = html.indexOf("Profile");
    const discoverabilityIndex = html.indexOf("Discoverability");
    const topicsIndex = html.indexOf("Topics");
    const availabilityIndex = html.indexOf("Availability");
    const calendarIndex = html.indexOf("Calendar Connection");

    expect(profileIndex).toBeGreaterThanOrEqual(0);
    expect(discoverabilityIndex).toBeGreaterThan(profileIndex);
    expect(topicsIndex).toBeGreaterThan(discoverabilityIndex);
    expect(availabilityIndex).toBeGreaterThan(topicsIndex);
    expect(calendarIndex).toBeGreaterThan(availabilityIndex);
  });

  it("renders data-status=pending when all required items are incomplete", async () => {
    vi.mocked(sessionModule.getServerSession).mockResolvedValue(buildSession(null));
    vi.mocked(workflowModule.createProductionSetupHomeWorkflow).mockReturnValue({
      async loadSummary() {
        await Promise.resolve();
        return SUMMARY_PENDING;
      },
    });

    const { default: Page } = await import("@/../app/(product)/page");
    const html = renderToString(await Page());

    expect(html).toContain('data-status="pending"');
    expect(html).toContain('data-status="optional"');
    expect(html).not.toContain('data-status="complete"');
  });

  it("renders data-status=complete for each card when the aggregate complete=true", async () => {
    vi.mocked(sessionModule.getServerSession).mockResolvedValue(buildSession("Ada Lovelace"));
    vi.mocked(workflowModule.createProductionSetupHomeWorkflow).mockReturnValue({
      async loadSummary() {
        await Promise.resolve();
        return SUMMARY_COMPLETE;
      },
    });

    const { default: Page } = await import("@/../app/(product)/page");
    const html = renderToString(await Page());

    expect(html).toContain('data-status="complete"');
    const completeCount = (html.match(/data-status="complete"/g) ?? []).length;
    expect(completeCount).toBe(5);
  });
});