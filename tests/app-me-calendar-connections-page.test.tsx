// @vitest-environment happy-dom
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionModule from "../src/auth/session";
import { setCalendarConnectionRepositoryForTests } from "../src/calendar/repository";
import { systemClock } from "../src/system/clock";
import {
  CalendarConnectionsView,
  type CalendarConnectionsViewProps,
} from "../app/(product)/me/_components/CalendarConnectionsView";
import type { CalendarConnectionPageState } from "../src/workflow/calendar-connection";
import type { CalendarConnectionRecord } from "../src/calendar/connection";

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

function noopAction() {
  return undefined as never;
}

function makeConnection(
  overrides: Partial<CalendarConnectionRecord> = {},
): CalendarConnectionRecord {
  const fixedNow = new Date("2026-07-12T12:00:00.000Z");
  return {
    id: "connection-1",
    userId: "user-1",
    provider: "google",
    providerAccountKey: "google:user-1",
    accountIdentifier: "user@gmail.com",
    scopes: "https://www.googleapis.com/auth/calendar.freebusy",
    status: "connected",
    refreshTokenEncrypted: "encrypted-refresh-token",
    accessTokenEncrypted: "encrypted-access-token",
    accessTokenExpiresAt: new Date("2026-07-12T13:00:00.000Z"),
    lastErrorCode: null,
    lastErrorMessage: null,
    lastSyncAt: fixedNow,
    contributingCalendarIds: [],
    ...overrides,
  };
}

function makePageState(
  records: CalendarConnectionRecord[],
): CalendarConnectionPageState {
  const now = systemClock().now();
  return {
    connections: records.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      accountIdentifier: connection.accountIdentifier,
      displayStatus:
        connection.status === "needs_reconnect"
          ? "needs_reconnect"
          : connection.status === "unsupported"
            ? "unsupported"
            : connection.status === "sync_delayed"
              ? "sync_delayed"
              : connection.lastErrorCode
                ? "failed"
                : "connected",
      lastSyncAt: connection.lastSyncAt ?? null,
      stale:
        now.getTime() - (connection.lastSyncAt?.getTime() ?? 0) >
        1000 * 60 * 60 * 24,
      calendars: [],
      calendarsError: false,
    })),
  };
}

const baseProps: CalendarConnectionsViewProps = {
  csrfToken: "csrf-token-1",
  pageState: null,
  outcome: { kind: "none" },
  mutationOutcome: { kind: "none" },
  saveAction: noopAction,
  refreshAction: noopAction,
  disconnectAction: noopAction,
};

describe("/me/calendar-connections (Calendar Connections page)", () => {
  beforeEach(() => {
    vi.mocked(sessionModule.getSessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
        displayName: "Alice User",
        avatarUrl: null,
        shortBio: null,
        role: "user",
        status: "active",
        profileTimezone: "America/New_York",
        bufferMinutes: 5,
      },
      csrfToken: "csrf-token-1",
    });
    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([]),
      findById: () => Promise.resolve(null),
      updateById: () => Promise.resolve(null),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    setCalendarConnectionRepositoryForTests(null);
  });

  it("renders a single h1 and the two connect CTAs", () => {
    const html = renderToString(
      <CalendarConnectionsView {...baseProps} pageState={null} />,
    );

    const headingMatches = html.match(/<h1\b/g) ?? [];
    expect(headingMatches).toHaveLength(1);
    expect(html).toContain("Connect Google Calendar");
    expect(html).toContain("Connect Microsoft Calendar");
    expect(html).toContain('data-testid="calendar-connection-connect-google"');
    expect(html).toContain('action="/me/calendar-connections/connect/google"');
    expect(html).toContain(
      'data-testid="calendar-connection-connect-microsoft"',
    );
    expect(html).toContain(
      'action="/me/calendar-connections/connect/microsoft"',
    );
  });

  it("renders the four typed banners when the corresponding outcome is set", () => {
    const connectedHtml = renderToString(
      <CalendarConnectionsView
        {...baseProps}
        outcome={{ kind: "connected" }}
      />,
    );
    expect(connectedHtml).toContain(
      'data-testid="calendar-connection-banner-connected"',
    );

    const deniedHtml = renderToString(
      <CalendarConnectionsView {...baseProps} outcome={{ kind: "denied" }} />,
    );
    expect(deniedHtml).toContain(
      'data-testid="calendar-connection-banner-denied"',
    );

    const unsupportedHtml = renderToString(
      <CalendarConnectionsView
        {...baseProps}
        outcome={{ kind: "unsupported" }}
      />,
    );
    expect(unsupportedHtml).toContain(
      'data-testid="calendar-connection-banner-unsupported"',
    );

    const failedHtml = renderToString(
      <CalendarConnectionsView
        {...baseProps}
        outcome={{ kind: "failed", requestId: "request-42" }}
      />,
    );
    expect(failedHtml).toContain(
      'data-testid="calendar-connection-banner-failed"',
    );
    expect(failedHtml).toContain("request-42");
  });

  it("renders the empty-state primitive when there are no connections", () => {
    const html = renderToString(
      <CalendarConnectionsView
        {...baseProps}
        pageState={{ connections: [] }}
      />,
    );
    expect(html).toContain('data-testid="calendar-connection-empty"');
    expect(html).toContain("You have no calendar connections yet");
  });

  it("renders a card for each connection with the right status pill", () => {
    const pageState = makePageState([
      makeConnection({ id: "connected" }),
      makeConnection({
        id: "needs-reconnect",
        status: "needs_reconnect",
      }),
      makeConnection({
        id: "unsupported",
        status: "unsupported",
      }),
      makeConnection({
        id: "sync-delayed",
        status: "sync_delayed",
      }),
      makeConnection({
        id: "failed",
        lastErrorCode: "SYNC_ERROR",
      }),
    ]);

    const html = renderToString(
      <CalendarConnectionsView {...baseProps} pageState={pageState} />,
    );

    expect(html).toContain('data-testid="calendar-connection-card-connected"');
    expect(html).toContain(
      'data-testid="calendar-connection-card-needs-reconnect"',
    );
    expect(html).toContain(
      'data-testid="calendar-connection-card-unsupported"',
    );
    expect(html).toContain(
      'data-testid="calendar-connection-card-sync-delayed"',
    );
    expect(html).toContain('data-testid="calendar-connection-card-failed"');

    expect(html).toContain('data-status="connected"');
    expect(html).toContain('data-status="needs_reconnect"');
    expect(html).toContain('data-status="unsupported"');
    expect(html).toContain('data-status="sync_delayed"');
    expect(html).toContain('data-status="failed"');
  });

  it("renders Save, Refresh, and Disconnect actions on a connected card with calendars", () => {
    const now = systemClock().now();
    const pageState: CalendarConnectionPageState = {
      connections: [
        {
          id: "connected",
          provider: "google",
          accountIdentifier: "user@gmail.com",
          displayStatus: "connected",
          lastSyncAt: now,
          stale: false,
          calendars: [
            {
              id: "primary",
              name: "Primary",
              isPrimary: true,
              selected: true,
            },
          ],
          calendarsError: false,
        },
      ],
    };

    const html = renderToString(
      <CalendarConnectionsView {...baseProps} pageState={pageState} />,
    );

    expect(html).toContain('data-testid="calendar-connection-save-connected"');
    expect(html).toContain(
      'data-testid="calendar-connection-refresh-connected"',
    );
    expect(html).toContain(
      'data-testid="calendar-connection-disconnect-connected"',
    );
    expect(html).toContain(
      'data-testid="calendar-connection-disconnect-confirm-connected"',
    );
  });

  it("renders a typed mutation error on the owning row", () => {
    const pageState: CalendarConnectionPageState = {
      connections: [
        {
          id: "connected",
          provider: "google",
          accountIdentifier: "user@gmail.com",
          displayStatus: "connected",
          lastSyncAt: systemClock().now(),
          stale: false,
          calendars: [],
          calendarsError: true,
        },
      ],
    };
    const html = renderToString(
      <CalendarConnectionsView
        {...baseProps}
        pageState={pageState}
        mutationOutcome={{
          kind: "error",
          intent: "disconnect",
          connectionId: "connected",
          errorCode: "invalid_confirmation",
        }}
      />,
    );

    expect(html).toContain(
      'data-testid="calendar-connection-mutation-error-connected"',
    );
    expect(html).toContain("The account identifier does not match.");
    expect(html).toContain('role="alert"');
  });

  it("renders a Reconnect action instead of Save/Refresh/Disconnect when needs_reconnect", () => {
    const pageState = makePageState([
      makeConnection({ id: "needs-reconnect", status: "needs_reconnect" }),
    ]);

    const html = renderToString(
      <CalendarConnectionsView {...baseProps} pageState={pageState} />,
    );

    expect(html).toContain(
      'data-testid="calendar-connection-reconnect-needs-reconnect"',
    );
    expect(html).toContain('action="/me/calendar-connections/connect/google"');
    expect(html).not.toContain(
      'data-testid="calendar-connection-save-needs-reconnect"',
    );
    expect(html).not.toContain(
      'data-testid="calendar-connection-refresh-needs-reconnect"',
    );
    expect(html).not.toContain(
      'data-testid="calendar-connection-disconnect-needs-reconnect"',
    );
  });

  it("never includes provider internals, tokens, or scopes in the rendered HTML", () => {
    const pageState = makePageState([makeConnection({ id: "connected" })]);
    const html = renderToString(
      <CalendarConnectionsView {...baseProps} pageState={pageState} />,
    );
    expect(html).not.toContain("encrypted-refresh-token");
    expect(html).not.toContain("encrypted-access-token");
    expect(html).not.toContain(
      "https://www.googleapis.com/auth/calendar.freebusy",
    );
    expect(html).not.toContain("provider:google:user-1");
    expect(html).not.toContain("providerAccountKey");
  });

  it("renders one card for each connection and never includes another User's data", () => {
    const pageState = makePageState([
      makeConnection({ id: "conn-1" }),
      makeConnection({ id: "conn-2", provider: "microsoft" }),
    ]);
    const html = renderToString(
      <CalendarConnectionsView {...baseProps} pageState={pageState} />,
    );
    expect(html).toContain('data-testid="calendar-connection-card-conn-1"');
    expect(html).toContain('data-testid="calendar-connection-card-conn-2"');
    expect(html).not.toContain(
      'data-testid="calendar-connection-card-other-user"',
    );
  });
});
