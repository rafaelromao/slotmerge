import { describe, expect, it } from "vitest";

import { computeCalendarConnectionHealthStatus } from "./calendar-connection-health";

describe("computeCalendarConnectionHealthStatus", () => {
  const now = new Date("2025-01-15T12:00:00Z");

  it("returns 'unsupported' when connection status is unsupported", () => {
    const connection = {
      id: "conn-1",
      status: "unsupported" as const,
      provider: "microsoft" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: null,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "unsupported",
    );
  });

  it("returns 'disconnected' when connection status is disconnected", () => {
    const connection = {
      id: "conn-1",
      status: "disconnected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: null,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "disconnected",
    );
  });

  it("returns 'needs_reconnect' when lastErrorCode is invalid_grant", () => {
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: "invalid_grant",
      lastErrorMessage: "Token has been revoked",
      lastSyncAt: now,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "needs_reconnect",
    );
  });

  it("returns 'needs_reconnect' when lastErrorCode is token_revoked", () => {
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: "token_revoked",
      lastErrorMessage: null,
      lastSyncAt: now,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "needs_reconnect",
    );
  });

  it("returns 'sync_delayed' when lastSyncAt is more than 1 hour ago", () => {
    const oneHourAgo = new Date(now.getTime() - 61 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: oneHourAgo,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "sync_delayed",
    );
  });

  it("returns 'connected' when fresh sync and no errors", () => {
    const recentSync = new Date(now.getTime() - 30 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: recentSync,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "connected",
    );
  });

  it("returns 'needs_reconnect' over 'sync_delayed' when both conditions are true", () => {
    const oneHourAgo = new Date(now.getTime() - 61 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: "invalid_grant",
      lastErrorMessage: "Token revoked",
      lastSyncAt: oneHourAgo,
    };
    expect(computeCalendarConnectionHealthStatus(connection, now)).toBe(
      "needs_reconnect",
    );
  });
});
