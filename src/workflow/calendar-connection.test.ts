import { describe, expect, it } from "vitest";

import {
  type CalendarConnectionRecord,
  type CalendarConnectionRepository,
  unsealCalendarConnectionState,
} from "../calendar/connection";
import { createCalendarConnectionWorkflow } from "./calendar-connection";

function connection(
  overrides: Partial<CalendarConnectionRecord> = {},
): CalendarConnectionRecord {
  return {
    id: "connection-1",
    userId: "user-1",
    provider: "google",
    providerAccountKey: "google:user-1",
    accountIdentifier: "user@example.com",
    scopes: "calendar.freebusy",
    status: "connected",
    refreshTokenEncrypted: "encrypted-refresh-token",
    accessTokenEncrypted: "encrypted-access-token",
    accessTokenExpiresAt: new Date("2026-07-12T13:00:00.000Z"),
    lastErrorCode: null,
    lastErrorMessage: null,
    lastSyncAt: new Date("2026-07-12T11:30:00.000Z"),
    contributingCalendarIds: [],
    ...overrides,
  };
}

function repository(
  records: CalendarConnectionRecord[],
): CalendarConnectionRepository {
  return {
    createPending: (record) => Promise.resolve(record),
    listByUserId: () => Promise.resolve(records),
    findById: () => Promise.resolve(null),
    updateById: () => Promise.resolve(null),
  };
}

describe("calendarConnectionWorkflow.loadPage", () => {
  it("returns only the User's visible Calendar Connections without secrets and defaults to the primary calendar", async () => {
    const workflow = createCalendarConnectionWorkflow({
      repository: repository([
        connection(),
        connection({ id: "pending", status: "pending" }),
        connection({ id: "disconnected", status: "disconnected" }),
        connection({ id: "other-user", userId: "user-2" }),
      ]),
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () =>
        Promise.resolve([
          { id: "primary", name: "Primary calendar", isPrimary: true },
        ]),
    });

    const result = await workflow.loadPage({ userId: "user-1" });

    expect(result).toEqual({
      ok: true,
      value: {
        connections: [
          {
            id: "connection-1",
            provider: "google",
            accountIdentifier: "user@example.com",
            displayStatus: "connected",
            lastSyncAt: new Date("2026-07-12T11:30:00.000Z"),
            stale: false,
            calendars: [
              {
                id: "primary",
                name: "Primary calendar",
                isPrimary: true,
                selected: true,
              },
            ],
            calendarsError: false,
          },
        ],
      },
    });
    if (!result.ok) throw new Error("Expected page state");
    expect(result.value.connections[0]).not.toHaveProperty(
      "accessTokenEncrypted",
    );
    expect(result.value.connections[0]).not.toHaveProperty(
      "refreshTokenEncrypted",
    );
    expect(result.value.connections[0]).not.toHaveProperty("scopes");
    expect(result.value.connections[0]).not.toHaveProperty("lastErrorCode");
    expect(result.value.connections[0]).not.toHaveProperty("lastErrorMessage");
  });

  it("projects the five Calendar Connection display states", async () => {
    const workflow = createCalendarConnectionWorkflow({
      repository: repository([
        connection({ id: "connected" }),
        connection({
          id: "sync-delayed",
          lastSyncAt: new Date("2026-07-12T10:00:00.000Z"),
        }),
        connection({ id: "needs-reconnect", status: "needs_reconnect" }),
        connection({ id: "unsupported", status: "unsupported" }),
        connection({ id: "failed", lastErrorCode: "SYNC_ERROR" }),
      ]),
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.resolve([]),
    });

    const result = await workflow.loadPage({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected page state");
    expect(
      result.value.connections.map(({ id, displayStatus }) => ({
        id,
        displayStatus,
      })),
    ).toEqual([
      { id: "connected", displayStatus: "connected" },
      { id: "sync-delayed", displayStatus: "sync_delayed" },
      { id: "needs-reconnect", displayStatus: "needs_reconnect" },
      { id: "unsupported", displayStatus: "unsupported" },
      { id: "failed", displayStatus: "failed" },
    ]);
  });

  it("keeps the page available with a typed row error when provider calendars cannot be listed", async () => {
    const workflow = createCalendarConnectionWorkflow({
      repository: repository([connection()]),
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () =>
        Promise.reject(new Error("provider detail that must not escape")),
    });

    const result = await workflow.loadPage({ userId: "user-1" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected page state");
    expect(result.value.connections[0]?.calendars).toEqual([]);
    expect(result.value.connections[0]?.calendarsError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });

  it("returns a typed load error without leaking repository details", async () => {
    const failingRepository = repository([]);
    failingRepository.listByUserId = () =>
      Promise.reject(new Error("database detail that must not escape"));
    const workflow = createCalendarConnectionWorkflow({
      repository: failingRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.resolve([]),
    });

    const result = await workflow.loadPage({ userId: "user-1" });

    expect(result).toEqual({ ok: false, error: { code: "load_failed" } });
    expect(JSON.stringify(result)).not.toContain("database detail");
  });
});

describe("calendarConnectionWorkflow.startOAuth", () => {
  it("creates one owned pending connection and returns a provider authorization URL", async () => {
    const created: CalendarConnectionRecord[] = [];
    const testRepository = repository([]);
    testRepository.createPending = (record) => {
      created.push(record);
      return Promise.resolve(record);
    };
    const now = new Date("2026-07-12T12:00:00.000Z");
    const secret = "0123456789abcdef0123456789abcdef";
    const workflow = createCalendarConnectionWorkflow({
      repository: testRepository,
      clock: { now: () => now },
      listProviderCalendars: () => Promise.resolve([]),
      oauth: {
        baseUrl: "http://localhost:3000",
        clientIds: { google: "google-client-id", microsoft: "ms-client-id" },
        csrfToken: "csrf-token-1",
        sessionId: "session-1",
        sessionSecret: secret,
        generateId: () => "new-connection-id",
      },
    });

    const result = await workflow.startOAuth({
      userId: "user-1",
      provider: "google",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected OAuth start");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: "new-connection-id",
      userId: "user-1",
      provider: "google",
      status: "pending",
    });
    const authorizeUrl = new URL(result.value.authorizeUrl);
    expect(authorizeUrl.hostname).toBe("accounts.google.com");
    const state = authorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    const payload = await unsealCalendarConnectionState({
      state: state ?? "",
      secret,
      now,
    });
    expect(payload).toMatchObject({
      version: 1,
      provider: "google",
      connectionId: "new-connection-id",
      sessionId: "session-1",
      returnTo: "/me/calendar-connections",
    });
  });

  it("atomically replaces an owned prior connection for reconnect", async () => {
    const replacements: Array<{
      previousId: string;
      userId: string;
      provider: string;
      pending: CalendarConnectionRecord;
    }> = [];
    const testRepository = repository([]);
    testRepository.replaceWithPending = (input) => {
      replacements.push(input);
      return Promise.resolve(input.pending);
    };
    const workflow = createCalendarConnectionWorkflow({
      repository: testRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.resolve([]),
      oauth: {
        baseUrl: "http://localhost:3000",
        clientIds: { google: "google-client-id", microsoft: "ms-client-id" },
        csrfToken: "csrf-token-1",
        sessionId: "session-1",
        sessionSecret: "0123456789abcdef0123456789abcdef",
        generateId: () => "replacement-connection-id",
      },
    });

    const result = await workflow.startOAuth({
      userId: "user-1",
      provider: "google",
      connectionId: "connection-to-replace",
    });

    expect(result.ok).toBe(true);
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      previousId: "connection-to-replace",
      userId: "user-1",
      provider: "google",
      pending: {
        id: "replacement-connection-id",
        userId: "user-1",
        provider: "google",
        status: "pending",
      },
    });
  });
});

describe("calendarConnectionWorkflow.mutateConnection", () => {
  function mutableRepository(initial: CalendarConnectionRecord) {
    let current = initial;
    const testRepository = repository([current]);
    testRepository.findById = (id) =>
      Promise.resolve(id === current.id ? current : null);
    testRepository.updateById = (id, patch) => {
      if (id !== current.id) return Promise.resolve(null);
      current = { ...current, ...patch };
      return Promise.resolve(current);
    };
    return { testRepository, current: () => current };
  }

  it("saves only provider-validated contributing calendars", async () => {
    const state = mutableRepository(connection());
    const workflow = createCalendarConnectionWorkflow({
      repository: state.testRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () =>
        Promise.resolve([
          { id: "primary", name: "Primary", isPrimary: true },
          { id: "team", name: "Team", isPrimary: false },
        ]),
    });

    await expect(
      workflow.mutateConnection({
        kind: "save",
        userId: "user-1",
        connectionId: "connection-1",
        calendarIds: ["team"],
      }),
    ).resolves.toEqual({ ok: true, value: { kind: "saved" } });
    expect(state.current().contributingCalendarIds).toEqual(["team"]);

    await expect(
      workflow.mutateConnection({
        kind: "save",
        userId: "user-1",
        connectionId: "connection-1",
        calendarIds: ["provider-internal-id"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "invalid_calendars" },
    });
    expect(state.current().contributingCalendarIds).toEqual(["team"]);
  });

  it("returns a typed provider error when calendars cannot be listed", async () => {
    const state = mutableRepository(connection());
    const workflow = createCalendarConnectionWorkflow({
      repository: state.testRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.reject(new Error("provider detail")),
    });

    await expect(
      workflow.mutateConnection({
        kind: "save",
        userId: "user-1",
        connectionId: "connection-1",
        calendarIds: ["primary"],
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "provider_unavailable" },
    });
  });

  it("queues refresh through the injected boundary", async () => {
    const queued: string[] = [];
    const state = mutableRepository(connection());
    const workflow = createCalendarConnectionWorkflow({
      repository: state.testRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.resolve([]),
      enqueueRefresh: (connectionId) => {
        queued.push(connectionId);
        return Promise.resolve();
      },
    });

    await expect(
      workflow.mutateConnection({
        kind: "refresh",
        userId: "user-1",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual({ ok: true, value: { kind: "refresh_queued" } });
    expect(queued).toEqual(["connection-1"]);
  });

  it("returns typed refresh and ownership errors", async () => {
    const state = mutableRepository(connection());
    const workflow = createCalendarConnectionWorkflow({
      repository: state.testRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.resolve([]),
    });

    await expect(
      workflow.mutateConnection({
        kind: "refresh",
        userId: "user-1",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "enqueue_failed" },
    });
    await expect(
      workflow.mutateConnection({
        kind: "refresh",
        userId: "user-2",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("disconnects locally when provider revocation fails", async () => {
    const state = mutableRepository(connection());
    const workflow = createCalendarConnectionWorkflow({
      repository: state.testRepository,
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
      listProviderCalendars: () => Promise.resolve([]),
      revokeConnection: () => Promise.reject(new Error("provider detail")),
    });

    await expect(
      workflow.mutateConnection({
        kind: "disconnect",
        userId: "user-1",
        connectionId: "connection-1",
        confirmAccountIdentifier: "wrong@example.com",
      }),
    ).resolves.toEqual({
      ok: false,
      error: { code: "invalid_confirmation" },
    });
    await expect(
      workflow.mutateConnection({
        kind: "disconnect",
        userId: "user-1",
        connectionId: "connection-1",
        confirmAccountIdentifier: "user@example.com",
      }),
    ).resolves.toEqual({
      ok: true,
      value: { kind: "disconnected", revocationFailed: true },
    });
    expect(state.current()).toMatchObject({
      status: "disconnected",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
    });
  });
});
