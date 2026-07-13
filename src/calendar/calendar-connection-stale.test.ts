import { describe, expect, it } from "vitest";

import { isCalendarConnectionStale, STALE_THRESHOLD_HOURS } from "./calendar-connection-health";

describe("isCalendarConnectionStale", () => {
  const now = new Date("2025-01-15T12:00:00Z");

  it("returns true when lastSyncAt is null and status is connected", () => {
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: null,
    };
    expect(isCalendarConnectionStale(connection, now)).toBe(true);
  });

  it("returns true when more than 24 hours have passed since lastSyncAt", () => {
    const tooOld = new Date(now.getTime() - (STALE_THRESHOLD_HOURS + 1) * 60 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: tooOld,
    };
    expect(isCalendarConnectionStale(connection, now)).toBe(true);
  });

  it("returns false when within the stale threshold", () => {
    const recent = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: recent,
    };
    expect(isCalendarConnectionStale(connection, now)).toBe(false);
  });

  it("returns false when status is disconnected regardless of lastSyncAt", () => {
    const tooOld = new Date(now.getTime() - (STALE_THRESHOLD_HOURS + 1) * 60 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "disconnected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: tooOld,
    };
    expect(isCalendarConnectionStale(connection, now)).toBe(false);
  });

  it("returns false when status is unsupported regardless of lastSyncAt", () => {
    const tooOld = new Date(now.getTime() - (STALE_THRESHOLD_HOURS + 1) * 60 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "unsupported" as const,
      provider: "microsoft" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: tooOld,
    };
    expect(isCalendarConnectionStale(connection, now)).toBe(false);
  });

  it("respects custom stale threshold", () => {
    const tooOld = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const connection = {
      id: "conn-1",
      status: "connected" as const,
      provider: "google" as const,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastSyncAt: tooOld,
    };
    expect(isCalendarConnectionStale(connection, now, 4)).toBe(true);
    expect(isCalendarConnectionStale(connection, now, 6)).toBe(false);
  });
});
