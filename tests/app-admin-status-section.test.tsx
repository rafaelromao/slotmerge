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
      counts: {
        pending: 0,
        connected: 0,
        disconnected: 0,
        needsReconnect: 0,
      },
      byProvider: [],
      tokensNeedingRefresh: [],
    },
    emailFailureRate: 0,
    pendingEmailCount: 0,
    needsReconnectCount: 0,
    tokensCount: 0,
    health: { email: "green", calendar: "green", tokens: "green" },
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

  it("renders green pills and zero counts when everything is healthy", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          email: {
            since: new Date("2026-07-11T12:00:00.000Z"),
            counts: { queued: 2, sending: 1, sent: 17, failed: 0 },
            recentFailures: [],
          },
          calendar: {
            counts: {
              pending: 1,
              connected: 5,
              disconnected: 0,
              needsReconnect: 0,
            },
            byProvider: [
              {
                provider: "google",
                counts: {
                  pending: 1,
                  connected: 3,
                  needsReconnect: 0,
                  disconnected: 0,
                },
              },
              {
                provider: "microsoft",
                counts: {
                  pending: 0,
                  connected: 2,
                  needsReconnect: 0,
                  disconnected: 0,
                },
              },
            ],
            tokensNeedingRefresh: [],
          },
          emailFailureRate: 0,
          pendingEmailCount: 3,
          needsReconnectCount: 0,
          tokensCount: 0,
          health: { email: "green", calendar: "green", tokens: "green" },
        })}
      />,
    );

    expect(html).toContain('data-testid="admin-status-email-pill"');
    expect(html).toContain('data-testid="admin-status-calendar-pill"');
    expect(html).toContain('data-testid="admin-status-tokens-pill"');
    expect(html).toMatch(/data-status="green"[^>]*data-testid="admin-status-email-pill"/);
    expect(html).toMatch(/data-status="green"[^>]*data-testid="admin-status-calendar-pill"/);
    expect(html).toMatch(/data-status="green"[^>]*data-testid="admin-status-tokens-pill"/);
    expect(html).toContain("<dt>Pending</dt><dd>3</dd>");
    expect(html).toContain("<dt>Sent</dt><dd>17</dd>");
    expect(html).toContain("<dt>Failed</dt><dd>0</dd>");
    expect(html).toContain("0.00<!-- -->%");
    expect(html).toContain("Google Calendar");
    expect(html).toContain("Microsoft Calendar");
  });

  it("renders amber pills at the amber boundaries", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          emailFailureRate: 5,
          needsReconnectCount: 1,
          tokensCount: 1,
          health: { email: "amber", calendar: "amber", tokens: "amber" },
        })}
      />,
    );

    expect(html).toMatch(/data-status="amber"[^>]*data-testid="admin-status-email-pill"/);
    expect(html).toMatch(/data-status="amber"[^>]*data-testid="admin-status-calendar-pill"/);
    expect(html).toMatch(/data-status="amber"[^>]*data-testid="admin-status-tokens-pill"/);
  });

  it("renders red pills at the red boundaries", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          emailFailureRate: 11,
          needsReconnectCount: 2,
          tokensCount: 4,
          health: { email: "red", calendar: "red", tokens: "red" },
        })}
      />,
    );

    expect(html).toMatch(/data-status="red"[^>]*data-testid="admin-status-email-pill"/);
    expect(html).toMatch(/data-status="red"[^>]*data-testid="admin-status-calendar-pill"/);
    expect(html).toMatch(/data-status="red"[^>]*data-testid="admin-status-tokens-pill"/);
  });
});