import { describe, expect, it, vi } from "vitest";

import type { Session } from "../../../../src/auth/session";
import {
  disconnectErrorRedirect,
  disconnectRedirectTarget,
  refreshErrorRedirect,
  refreshRedirectTarget,
} from "./calendar-connections.redirects";

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
  describe("error redirects", () => {
    it("returns the user-page error redirect for non-admin actors", () => {
      expect(refreshErrorRedirect(userSession(), "csrf_error", null)).toBe(
        "/me/calendar-connections?intent=refresh&error=csrf_error",
      );
      expect(disconnectErrorRedirect(userSession(), "csrf_error")).toBe(
        "/me/calendar-connections?intent=disconnect&error=csrf_error",
      );
    });

    it("returns the admin-page error redirect for admin actors", () => {
      expect(refreshErrorRedirect(adminSession(), "csrf_error", null)).toBe(
        "/admin?action=refresh_err&error=csrf_error",
      );
      expect(refreshErrorRedirect(adminSession(), "csrf_error", "conn-1")).toBe(
        "/admin?action=refresh_err&error=csrf_error&connectionId=conn-1",
      );
      expect(disconnectErrorRedirect(adminSession(), "csrf_error")).toBe(
        "/admin?action=disconnect_err&error=csrf_error",
      );
    });
  });

  describe("resolveTargetUserId (via findById)", () => {
    it("looks up the connection's userId via findById for admin actors", async () => {
      const spy = vi
        .spyOn(
          await import("../../../../src/calendar/repository"),
          "findCalendarConnectionById",
        )
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
        const result = await (
          await import("../../../../src/calendar/repository")
        ).findCalendarConnectionById("conn-1", { now: () => new Date() });
        expect(result?.userId).toBe("user-target");
        expect(spy).toHaveBeenCalledWith("conn-1", expect.any(Object));
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
