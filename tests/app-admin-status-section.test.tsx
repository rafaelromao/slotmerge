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

  it("does not render Email or Calendar warning banners when health is green", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          health: { email: "green", calendar: "green", tokens: "green" },
        })}
      />,
    );

    expect(html).not.toContain("admin-status-email-warning");
    expect(html).not.toContain("admin-status-calendar-warning");
  });

  it("renders the Email warning banner with verbatim copy when Email is amber", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          emailFailureRate: 6,
          needsReconnectCount: 0,
          tokensCount: 0,
          health: { email: "amber", calendar: "green", tokens: "green" },
        })}
      />,
    );

    expect(html).toContain('data-testid="admin-status-email-warning"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(
      "Email delivery is degraded. The latest",
    );
    expect(html).toContain("<code>emailEvent</code>");
    expect(html).toContain(
      "rows in the DB are the source of truth; a re-run is automatic on the next retry window.",
    );
  });

  it("renders the Calendar warning banner with verbatim copy when Calendar is red", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          emailFailureRate: 0,
          needsReconnectCount: 3,
          tokensCount: 0,
          health: { email: "green", calendar: "red", tokens: "green" },
        })}
      />,
    );

    expect(html).toContain('data-testid="admin-status-calendar-warning"');
    // The exact wording from the issue AC, with a Unicode right single
    // quotation mark for the apostrophe in "User's".
    expect(html).toContain(
      "One or more Calendar connections need reconnect. Visit",
    );
    expect(html).toContain("<code>/me/calendar-connections</code>");
    expect(html).toContain("on the affected User");
  });

  it("warning banners never reveal any User identity", () => {
    const html = renderToString(
      <AdminStatusSection
        statusResult={makeResult({
          emailFailureRate: 11,
          needsReconnectCount: 3,
          tokensCount: 4,
          health: { email: "red", calendar: "red", tokens: "red" },
        })}
      />,
    );

    const emailBanner = extractBlock(
      html,
      'data-testid="admin-status-email-warning"',
    );
    const calendarBanner = extractBlock(
      html,
      'data-testid="admin-status-calendar-warning"',
    );

    for (const block of [emailBanner, calendarBanner]) {
      expect(block).not.toContain("user@example.com");
      expect(block).not.toContain("user-1");
      expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(block).not.toContain("Alice");
      expect(block).not.toContain("Carol");
    }
  });
});

function extractBlock(html: string, marker: string): string {
  const start = html.indexOf(marker);
  if (start === -1) {
    return "";
  }
  const close = html.indexOf("</p>", start);
  if (close === -1) {
    return html.slice(start);
  }
  return html.slice(start, close);
}