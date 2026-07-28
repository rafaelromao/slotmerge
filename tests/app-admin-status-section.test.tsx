// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AdminStatusSection,
  type AdminStatusSectionProps,
} from "../app/(product)/admin/_components/AdminStatusSection";

function makeResult(
  overrides: Partial<AdminStatusSectionProps["statusResult"]> = {},
): AdminStatusSectionProps["statusResult"] {
  return {
    generatedAt: new Date("2026-07-12T12:00:00.000Z"),
    windowHours: 24,
    email: {
      since: new Date("2026-07-11T12:00:00.000Z"),
      counts: { queued: 0, sending: 0, sent: 0, failed: 0 },
      recentFailures: [],
    },
    calendar: {
      counts: { pending: 0, connected: 0, disconnected: 0 },
      tokensNeedingRefresh: [],
    },
    ...overrides,
  };
}

describe("AdminStatusSection", () => {
  it("renders the generated-at timestamp and three sub-blocks when empty", () => {
    const html = renderToString(
      <AdminStatusSection statusResult={makeResult()} />,
    );

    expect(html).toContain("data-testid=\"admin-status-body\"");
    expect(html).toContain("data-testid=\"admin-status-generated-at\"");
    expect(html).toContain("2026-07-12T12:00:00.000Z");
    expect(html).toContain("Transactional email delivery");
    expect(html).toContain("Calendar connections");
    expect(html).toContain("Tokens needing refresh");
    expect(html).toContain("data-testid=\"admin-status-email-block\"");
    expect(html).toContain("data-testid=\"admin-status-calendar-block\"");
    expect(html).toContain("data-testid=\"admin-status-tokens-block\"");
  });

  it("does not render a global Refresh now button", () => {
    const html = renderToString(
      <AdminStatusSection statusResult={makeResult()} />,
    );

    expect(html).not.toContain("Refresh now");
    expect(html).not.toContain("Send critical operational email");
  });

  it("uses the admin-status inner-block wrapper classes", () => {
    const html = renderToString(
      <AdminStatusSection statusResult={makeResult()} />,
    );

    expect(html).toContain("admin-status-section");
    expect(html).toContain("admin-status-email-block");
    expect(html).toContain("admin-status-calendar-block");
    expect(html).toContain("admin-status-tokens-block");
  });
});