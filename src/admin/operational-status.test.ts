import { describe, expect, it, vi } from "vitest";

import { createAdminStatusHandlers } from "./operational-status";

describe("admin operational status", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    const { GET } = createAdminStatusHandlers({
      getSession: vi.fn().mockResolvedValue(null),
      statusRepository: {
        summarizeEmailDelivery: vi.fn(),
        summarizeCalendarConnections: vi.fn(),
      },
      clock: { now: () => new Date("2026-01-02T00:00:00Z") },
    });

    const response = await GET(new Request("http://localhost/admin/status"));

    expect(response.status).toBe(401);
    const html = await response.text();
    expect(html).toContain("Sign in required.");
  });

  it("returns 403 when the request is from a non-admin session", async () => {
    const { GET } = createAdminStatusHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          email: "user@example.com",
          displayName: null,
          avatarUrl: null,
          shortBio: null,
          role: "user",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      statusRepository: {
        summarizeEmailDelivery: vi.fn(),
        summarizeCalendarConnections: vi.fn(),
      },
      clock: { now: () => new Date("2026-01-02T00:00:00Z") },
    });

    const response = await GET(new Request("http://localhost/admin/status"));

    expect(response.status).toBe(403);
    const html = await response.text();
    expect(html).toContain("Admin access required.");
  });

  it("renders an admin-facing status page with the Operational status heading when authenticated as admin", async () => {
    const { GET } = createAdminStatusHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          avatarUrl: null,
          shortBio: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      statusRepository: {
        summarizeEmailDelivery: vi.fn().mockResolvedValue({
          since: new Date("2026-01-01T00:00:00Z"),
          counts: { queued: 0, sending: 0, sent: 0, failed: 0 },
          recentFailures: [],
        }),
        summarizeCalendarConnections: vi.fn().mockResolvedValue({
          counts: { pending: 0, connected: 0, disconnected: 0 },
          tokensNeedingRefresh: [],
        }),
      },
      clock: { now: () => new Date("2026-01-02T00:00:00Z") },
    });

    const response = await GET(new Request("http://localhost/admin/status"));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<h1>Operational status</h1>");
    expect(html).toContain("<h2>Transactional email delivery</h2>");
    expect(html).toContain("<h2>Calendar Connections</h2>");
    expect(html).toContain("No email events recorded yet.");
    expect(html).toContain("No failures in the last 24 hours.");
    expect(html).toContain("No tokens needing refresh.");
    expect(html).toContain("Queued: 0");
    expect(html).toContain("Sent: 0");
    expect(html).toContain("Failed: 0");
    expect(html).toContain("Pending: 0");
    expect(html).toContain("Connected: 0");
    expect(html).toContain("Disconnected: 0");
  });

  it("summarises email counts and renders the most recent failures with code, message, and recipient", async () => {
    const failureA = {
      emailEventId: "evt-1",
      recipient: "alice@example.com",
      type: "magic-link",
      code: "smtp-timeout",
      message: "Upstream SMTP timed out",
      failedAt: new Date("2026-01-01T23:55:00Z"),
    };
    const failureB = {
      emailEventId: "evt-2",
      recipient: "bob@example.com",
      type: "invite",
      code: "rate-limit",
      message: "Postmark 429",
      failedAt: new Date("2026-01-01T20:00:00Z"),
    };

    const { GET } = createAdminStatusHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          avatarUrl: null,
          shortBio: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      statusRepository: {
        summarizeEmailDelivery: vi.fn().mockResolvedValue({
          since: new Date("2026-01-01T00:00:00Z"),
          counts: { queued: 2, sending: 1, sent: 17, failed: 4 },
          recentFailures: [failureA, failureB],
        }),
        summarizeCalendarConnections: vi.fn().mockResolvedValue({
          counts: { pending: 0, connected: 0, disconnected: 0 },
          tokensNeedingRefresh: [],
        }),
      },
      clock: { now: () => new Date("2026-01-02T00:00:00Z") },
    });

    const response = await GET(new Request("http://localhost/admin/status"));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Queued: 2");
    expect(html).toContain("Sending: 1");
    expect(html).toContain("Sent: 17");
    expect(html).toContain("Failed: 4");
    expect(html).not.toContain("No email events recorded yet.");
    expect(html).toContain("alice@example.com");
    expect(html).toContain("smtp-timeout");
    expect(html).toContain("Upstream SMTP timed out");
    expect(html).toContain("bob@example.com");
    expect(html).toContain("rate-limit");
    expect(html).toContain("Postmark 429");
    expect(html).toContain("2026-01-01T23:55:00.000Z");
    expect(html).toContain("2026-01-01T20:00:00.000Z");
  });

  it("escapes HTML in recent failure messages and recipients", async () => {
    const { GET } = createAdminStatusHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          avatarUrl: null,
          shortBio: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      statusRepository: {
        summarizeEmailDelivery: vi.fn().mockResolvedValue({
          since: new Date("2026-01-01T00:00:00Z"),
          counts: { queued: 0, sending: 0, sent: 0, failed: 1 },
          recentFailures: [
            {
              emailEventId: "evt-1",
              recipient: "attacker@example.com<script>",
              type: "invite",
              code: "evil",
              message: "<img src=x onerror=alert(1)>",
              failedAt: new Date("2026-01-01T23:55:00Z"),
            },
          ],
        }),
        summarizeCalendarConnections: vi.fn().mockResolvedValue({
          counts: { pending: 0, connected: 0, disconnected: 0 },
          tokensNeedingRefresh: [],
        }),
      },
      clock: { now: () => new Date("2026-01-02T00:00:00Z") },
    });

    const response = await GET(new Request("http://localhost/admin/status"));
    const html = await response.text();

    expect(html).toContain("attacker@example.com&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("renders Calendar Connection counts and tokens needing refresh across all three buckets", async () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const expiredAt = new Date(now.getTime() - 60 * 1000);
    const expiringSoonAt = new Date(now.getTime() + 2 * 60 * 1000);

    const { GET } = createAdminStatusHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          avatarUrl: null,
          shortBio: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      statusRepository: {
        summarizeEmailDelivery: vi.fn().mockResolvedValue({
          since: new Date("2026-01-01T00:00:00Z"),
          counts: { queued: 0, sending: 0, sent: 0, failed: 0 },
          recentFailures: [],
        }),
        summarizeCalendarConnections: vi.fn().mockResolvedValue({
          counts: { pending: 1, connected: 5, disconnected: 2 },
          tokensNeedingRefresh: [
            {
              connectionId: "conn-expired",
              userId: "user-1",
              provider: "google",
              accountIdentifier: "alice@example.com",
              status: "connected",
              accessTokenExpiresAt: expiredAt,
              bucket: "expired",
            },
            {
              connectionId: "conn-soon",
              userId: "user-2",
              provider: "google",
              accountIdentifier: "bob@example.com",
              status: "connected",
              accessTokenExpiresAt: expiringSoonAt,
              bucket: "expiring_soon",
            },
            {
              connectionId: "conn-unset",
              userId: "user-3",
              provider: "google",
              accountIdentifier: "carol@example.com",
              status: "connected",
              accessTokenExpiresAt: null,
              bucket: "unset",
            },
          ],
        }),
      },
      clock: { now: () => now },
    });

    const response = await GET(new Request("http://localhost/admin/status"));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Pending: 1");
    expect(html).toContain("Connected: 5");
    expect(html).toContain("Disconnected: 2");
    expect(html).toContain("alice@example.com");
    expect(html).toContain("bob@example.com");
    expect(html).toContain("carol@example.com");
    expect(html).toContain(expiredAt.toISOString());
    expect(html).toContain(expiringSoonAt.toISOString());
    expect(html).toContain(">expired<");
    expect(html).toContain(">expiring_soon<");
    expect(html).toContain(">unset<");
    expect(html).not.toContain("No tokens needing refresh.");
  });
});
