import { describe, expect, it } from "vitest";

import type {
  CalendarConnectionRecord,
  CalendarConnectionRepository,
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
