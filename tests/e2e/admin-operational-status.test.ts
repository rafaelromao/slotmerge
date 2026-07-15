import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

import { GET } from "../../app/admin/status/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { getTestDb } from "../helpers/setup";
import { FIXTURE_DATE } from "../fixtures/seeds";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const FIXED_NOW = new Date(FIXTURE_DATE);

function isoMinusMinutes(minutes: number): string {
  return new Date(FIXED_NOW.getTime() - minutes * 60_000).toISOString();
}

function isoPlusMs(ms: number): string {
  return new Date(FIXED_NOW.getTime() + ms).toISOString();
}

async function adminCookie(): Promise<string> {
  return sealSessionCookie({
    sessionId: "session-admin-operational-status",
  });
}

function adminSession() {
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000003",
      email: "admin@example.com",
      displayName: "Carol Admin",
      avatarUrl: null,
      shortBio: null,
      role: "admin" as const,
      status: "active" as const,
      profileTimezone: "Europe/London",
      bufferMinutes: 0,
    },
    csrfToken: "csrf-token-admin",
  };
}

function nonAdminSession() {
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "user@example.com",
      displayName: "Alice User",
      avatarUrl: null,
      shortBio: null,
      role: "user" as const,
      status: "active" as const,
      profileTimezone: "America/New_York",
      bufferMinutes: 5,
    },
    csrfToken: "csrf-token-user",
  };
}

function requestWithCookie(cookie: string): Request {
  return new Request("http://localhost/admin/status", {
    headers: { cookie },
  });
}

describe("E2E admin operational status page", () => {
  beforeAll(() => {
    // The route handler reads from process.env.DATABASE_URL via the cached
    // pool in src/db/client.ts. Point that env var at the ephemeral test
    // database created by tests/helpers/global-setup.ts so the route
    // observes the same rows this test seeds through getTestDb().
    const url = inject("testDbUrl") as string | undefined;
    if (url) {
      process.env.DATABASE_URL = url;
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    vi.useRealTimers();
  });

  it.runIf(HAS_TEST_DB)(
    "returns 401 with the 'Sign in required.' body when no session cookie is present",
    async () => {
      const response = await GET(new Request("http://localhost/admin/status"));

      expect(response.status).toBe(401);
      const html = await response.text();
      expect(html).toContain("Sign in required.");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "returns 403 with the 'Admin access required.' body when the session belongs to a non-admin user",
    async () => {
      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(
            sessionId === "session-non-admin" ? nonAdminSession() : null,
          ),
      });
      const cookie = await sealSessionCookie({
        sessionId: "session-non-admin",
      });

      const response = await GET(requestWithCookie(cookie));

      expect(response.status).toBe(403);
      const html = await response.text();
      expect(html).toContain("Admin access required.");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "renders the heading, both section headings, and seed-derived counts when the admin has no extra records",
    async () => {
      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(
            sessionId === "session-admin-operational-status"
              ? adminSession()
              : null,
          ),
      });

      const response = await GET(requestWithCookie(await adminCookie()));

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<h1>Operational status</h1>");
      expect(html).toContain("<h2>Transactional email delivery</h2>");
      expect(html).toContain("<h2>Calendar Connections</h2>");
      expect(html).toContain("No email events recorded yet.");
      expect(html).toContain("No failures in the last 24 hours.");
      expect(html).toContain("Queued: 0");
      expect(html).toContain("Sending: 0");
      expect(html).toContain("Sent: 0");
      expect(html).toContain("Failed: 0");
      expect(html).toContain("Pending: 0");
      expect(html).toContain("Connected: 2");
      expect(html).toContain("Disconnected: 0");
      // The seed has 2 connected connections with null accessTokenExpiresAt,
      // so they surface in the "unset" tokens-needing-refresh bucket.
      expect(html).not.toContain("No tokens needing refresh.");
      expect(html).toContain("user@gmail.com");
      expect(html).toContain("user@outlook.com");
      expect(html).toContain(">unset<");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "aggregates email delivery counts across queued, sending, sent, and failed statuses with recent failure details",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      const created = FIXED_NOW.toISOString();
      const failedAt5Min = isoMinusMinutes(5);
      const failedAt120Min = isoMinusMinutes(120);
      const failedAt600Min = isoMinusMinutes(600);
      const failedAt1430Min = isoMinusMinutes(1430);

      await db.execute(`INSERT INTO email_events
        (id, recipient, type, payload_reference, status, attempts, created_at, updated_at, failed_at, last_error_code, last_error_message)
        VALUES
          ('00000000-0000-0000-0000-0000000000a1', 'queued-1@example.com', 'invite', 'ref-q-1', 'queued', 0, '${created}', '${created}', NULL, NULL, NULL),
          ('00000000-0000-0000-0000-0000000000a2', 'queued-2@example.com', 'invite', 'ref-q-2', 'queued', 0, '${created}', '${created}', NULL, NULL, NULL),
          ('00000000-0000-0000-0000-0000000000a3', 'sending-1@example.com', 'magic-link', 'ref-s-1', 'sending', 1, '${created}', '${created}', NULL, NULL, NULL),
          ('00000000-0000-0000-0000-0000000000a4', 'sent-1@example.com', 'invite', 'ref-d-1', 'sent', 1, '${created}', '${created}', NULL, NULL, NULL)`);

      const sentIds = [
        "00000000-0000-0000-0000-0000000000b0",
        "00000000-0000-0000-0000-0000000000b1",
        "00000000-0000-0000-0000-0000000000b2",
        "00000000-0000-0000-0000-0000000000b3",
        "00000000-0000-0000-0000-0000000000b4",
        "00000000-0000-0000-0000-0000000000b5",
        "00000000-0000-0000-0000-0000000000b6",
        "00000000-0000-0000-0000-0000000000b7",
        "00000000-0000-0000-0000-0000000000b8",
        "00000000-0000-0000-0000-0000000000b9",
        "00000000-0000-0000-0000-0000000000ba",
        "00000000-0000-0000-0000-0000000000bb",
        "00000000-0000-0000-0000-0000000000bc",
        "00000000-0000-0000-0000-0000000000bd",
        "00000000-0000-0000-0000-0000000000be",
        "00000000-0000-0000-0000-0000000000bf",
      ];
      for (const id of sentIds) {
        await db.execute(
          `INSERT INTO email_events (id, recipient, type, payload_reference, status, attempts, created_at, updated_at, sent_at) VALUES ('${id}', '${id}@example.com', 'magic-link', 'ref-${id}', 'sent', 1, '${created}', '${created}', '${created}')`,
        );
      }

      await db.execute(`INSERT INTO email_events
        (id, recipient, type, payload_reference, status, attempts, created_at, updated_at, failed_at, last_error_code, last_error_message)
        VALUES
          ('00000000-0000-0000-0000-0000000000c1', 'alice@example.com', 'magic-link', 'ref-f-1', 'failed', 1, '${created}', '${created}', '${failedAt5Min}', 'smtp-timeout', 'Upstream SMTP timed out'),
          ('00000000-0000-0000-0000-0000000000c2', 'bob@example.com', 'invite', 'ref-f-2', 'failed', 1, '${created}', '${created}', '${failedAt120Min}', 'rate-limit', 'Postmark 429'),
          ('00000000-0000-0000-0000-0000000000c3', 'carol@example.com', 'calendar-action-required', 'ref-f-3', 'failed', 1, '${created}', '${created}', '${failedAt600Min}', 'invalid-grant', 'Token revoked by provider'),
          ('00000000-0000-0000-0000-0000000000c4', 'dave@example.com', 'invite', 'ref-f-4', 'failed', 1, '${created}', '${created}', '${failedAt1430Min}', 'network-error', 'Connection reset by peer')`);

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(
            sessionId === "session-admin-operational-status"
              ? adminSession()
              : null,
          ),
      });

      const response = await GET(requestWithCookie(await adminCookie()));

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Queued: 2");
      expect(html).toContain("Sending: 1");
      expect(html).toContain("Sent: 17");
      expect(html).toContain("Failed: 4");
      expect(html).not.toContain("No email events recorded yet.");
      expect(html).not.toContain("No failures in the last 24 hours.");
      expect(html).toContain("alice@example.com");
      expect(html).toContain("smtp-timeout");
      expect(html).toContain("Upstream SMTP timed out");
      expect(html).toContain("bob@example.com");
      expect(html).toContain("rate-limit");
      expect(html).toContain("Postmark 429");
      expect(html).toContain("carol@example.com");
      expect(html).toContain("invalid-grant");
      expect(html).toContain("Token revoked by provider");
      expect(html).toContain("dave@example.com");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "aggregates Calendar Connection status counts and surfaces tokens needing refresh across all three buckets",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      const now = FIXED_NOW.toISOString();
      const expiredAt = isoPlusMs(-60_000);
      const expiringSoonAt = isoPlusMs(2 * 60_000);
      const adminUserId = adminSession().user.id;

      await db.execute(`INSERT INTO calendar_connections
        (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
        VALUES
          ('00000000-0000-0000-0000-0000000000d1', '${adminUserId}', 'google', 'google:cc-pending', 'pending@example.com', 'https://www.googleapis.com/auth/calendar.freebusy', 'pending', '[]'::jsonb, '${now}', '${now}'),
          ('00000000-0000-0000-0000-0000000000d2', '${adminUserId}', 'microsoft', 'microsoft:cc-disconnected', 'disconnected@example.com', 'Calendars.Read', 'disconnected', '[]'::jsonb, '${now}', '${now}')`);

      await db.execute(`INSERT INTO calendar_connections
        (id, user_id, provider, provider_account_key, account_identifier, scopes, status, access_token_expires_at, contributing_calendar_ids, created_at, updated_at)
        VALUES
          ('00000000-0000-0000-0000-0000000000d3', '${adminUserId}', 'google', 'google:cc-expired', 'expired@example.com', 'https://www.googleapis.com/auth/calendar.freebusy', 'connected', '${expiredAt}', '[]'::jsonb, '${now}', '${now}'),
          ('00000000-0000-0000-0000-0000000000d4', '${adminUserId}', 'microsoft', 'microsoft:cc-soon', 'soon@example.com', 'Calendars.Read', 'connected', '${expiringSoonAt}', '[]'::jsonb, '${now}', '${now}')`);

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(
            sessionId === "session-admin-operational-status"
              ? adminSession()
              : null,
          ),
      });

      const response = await GET(requestWithCookie(await adminCookie()));

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Pending: 1");
      expect(html).toContain("Connected: 4");
      expect(html).toContain("Disconnected: 1");
      expect(html).toContain("expired@example.com");
      expect(html).toContain("soon@example.com");
      expect(html).toContain("user@gmail.com");
      expect(html).toContain("user@outlook.com");
      expect(html).toContain(">expired<");
      expect(html).toContain(">expiring_soon<");
      expect(html).toContain(">unset<");
      expect(html).not.toContain("No tokens needing refresh.");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "simultaneously reflects healthy and unhealthy states across email delivery and Calendar Connections",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      const now = FIXED_NOW.toISOString();
      const healthyExpiry = isoPlusMs(60 * 60_000);
      const expiredExpiry = isoPlusMs(-60_000);
      const adminUserId = adminSession().user.id;

      await db.execute(`INSERT INTO email_events
        (id, recipient, type, payload_reference, status, attempts, created_at, updated_at, sent_at, failed_at, last_error_code, last_error_message)
        VALUES
          ('00000000-0000-0000-0000-0000000000e1', 'healthy@example.com', 'invite', 'ref-h-1', 'sent', 1, '${now}', '${now}', '${now}', NULL, NULL, NULL),
          ('00000000-0000-0000-0000-0000000000e2', 'unhealthy@example.com', 'invite', 'ref-u-1', 'failed', 1, '${now}', '${now}', NULL, '${now}', 'smtp-timeout', 'Upstream SMTP timed out')`);

      await db.execute(`INSERT INTO calendar_connections
        (id, user_id, provider, provider_account_key, account_identifier, scopes, status, access_token_expires_at, contributing_calendar_ids, created_at, updated_at)
        VALUES
          ('00000000-0000-0000-0000-0000000000f1', '${adminUserId}', 'google', 'google:cc-healthy', 'healthy-conn@example.com', 'https://www.googleapis.com/auth/calendar.freebusy', 'connected', '${healthyExpiry}', '[]'::jsonb, '${now}', '${now}'),
          ('00000000-0000-0000-0000-0000000000f2', '${adminUserId}', 'microsoft', 'microsoft:cc-expired-mixed', 'expired-conn@example.com', 'Calendars.Read', 'connected', '${expiredExpiry}', '[]'::jsonb, '${now}', '${now}'),
          ('00000000-0000-0000-0000-0000000000f3', '${adminUserId}', 'google', 'google:cc-disconnected-mixed', 'disconnected-conn@example.com', 'https://www.googleapis.com/auth/calendar.freebusy', 'disconnected', NULL, '[]'::jsonb, '${now}', '${now}')`);

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(
            sessionId === "session-admin-operational-status"
              ? adminSession()
              : null,
          ),
      });

      const response = await GET(requestWithCookie(await adminCookie()));

      expect(response.status).toBe(200);
      const html = await response.text();

      // Healthy and unhealthy email delivery both surface.
      expect(html).toContain("Sent: 1");
      expect(html).toContain("Failed: 1");
      expect(html).toContain("unhealthy@example.com");
      expect(html).toContain("smtp-timeout");

      // Calendar Connection status aggregates surface both healthy and
      // unhealthy connections. Seed contributes 2 connected + 1 new
      // healthy-conn + 1 new expired-conn = 4 connected in total.
      expect(html).toContain("Connected: 4");
      expect(html).toContain("Disconnected: 1");
      // The expired-token connection surfaces in the tokens-needing-refresh
      // table; Disconnected: 1 above proves the disconnected-conn row is
      // present in the DB even though disconnected rows are not listed
      // individually on the page (only their count is rendered).
      expect(html).toContain("expired-conn@example.com");
      expect(html).toContain(">expired<");
    },
  );
});
