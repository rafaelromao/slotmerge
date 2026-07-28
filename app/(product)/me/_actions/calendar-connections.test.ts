import { describe, expect, it, vi } from "vitest";

import type { Session } from "../../../../src/auth/session";
import {
  __testing,
  disconnectRedirectTarget,
  refreshRedirectTarget,
} from "./calendar-connections";

function userSession(userId = "user-1"): Session {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      displayName: null,
      avatarUrl: null,
      shortBio: null,
      role: "user",
      status: "active",
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken: "csrf-user",
  };
}

function adminSession(userId = "admin-1"): Session {
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      displayName: null,
      avatarUrl: null,
      shortBio: null,
      role: "admin",
      status: "active",
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken: "csrf-admin",
  };
}

describe("calendar-connections admin override", () => {
  describe("resolveTargetUserId", () => {
    it("returns session.user.id for non-admin actors", async () => {
      const findById = vi.fn();
      const target = await __testing.resolveTargetUserId({
        session: userSession("user-7"),
        connectionId: "conn-1",
      });
      expect(target).toBe("user-7");
    });

    it("looks up the connection's userId via findById for admin actors", async () => {
      const original = await import(
        "../../../../src/calendar/repository"
      );
      const spy = vi
        .spyOn(original, "findCalendarConnectionById")
        .mockResolvedValue({
          id: "conn-1",
          userId: "user-target",
          provider: "google",
          providerAccountKey: null,
          accountIdentifier: "alice@example.com",
          scopes: null,
          status: "connected",
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastSyncAt: null,
          contributingCalendarIds: [],
        });
      try {
        const target = await __testing.resolveTargetUserId({
          session: adminSession(),
          connectionId: "conn-1",
        });
        expect(target).toBe("user-target");
        expect(spy).toHaveBeenCalledWith("conn-1");
      } finally {
        spy.mockRestore();
      }
    });

    it("returns null for admin actors when the connection is missing", async () => {
      const original = await import(
        "../../../../src/calendar/repository"
      );
      const spy = vi
        .spyOn(original, "findCalendarConnectionById")
        .mockResolvedValue(null);
      try {
        const target = await __testing.resolveTargetUserId({
          session: adminSession(),
          connectionId: "missing",
        });
        expect(target).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("refreshRedirectTarget", () => {
    it("returns the user-page redirect for non-admin actors", () => {
      expect(refreshRedirectTarget(userSession(), "conn-1")).toBe(
        "/me/calendar-connections?intent=refresh&success=1&connectionId=conn-1",
      );
    });

    it("returns the admin-page redirect for admin actors", () => {
      expect(refreshRedirectTarget(adminSession(), "conn-1")).toBe(
        "/admin?action=refresh_ok&connectionId=conn-1",
      );
    });
  });

  describe("disconnectRedirectTarget", () => {
    it("returns the user-page redirect for non-admin actors", () => {
      expect(disconnectRedirectTarget(userSession())).toBe(
        "/me/calendar-connections?intent=disconnect&success=1",
      );
    });

    it("returns the admin-page redirect for admin actors", () => {
      expect(disconnectRedirectTarget(adminSession())).toBe(
        "/admin?action=disconnect_ok",
      );
    });
  });
});