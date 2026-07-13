import { describe, expect, it } from "vitest";

import type { Session } from "./session";
import { isOrganizerOrAdminSession } from "./session";

const baseSession = {
  user: {
    id: "user-1",
    email: "test@example.com",
    displayName: null,
    avatarUrl: null,
    shortBio: null,
    role: "organizer" as const,
    status: "active" as const,
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token",
};

describe("isOrganizerOrAdminSession", () => {
  it("returns true when role is organizer", () => {
    const session: Session = baseSession;
    expect(isOrganizerOrAdminSession(session)).toBe(true);
  });

  it("returns true when role is admin", () => {
    const session: Session = {
      ...baseSession,
      user: { ...baseSession.user, role: "admin" },
    };
    expect(isOrganizerOrAdminSession(session)).toBe(true);
  });

  it("returns false when role is user", () => {
    const session: Session = {
      ...baseSession,
      user: { ...baseSession.user, role: "user" },
    };
    expect(isOrganizerOrAdminSession(session)).toBe(false);
  });

  it("returns false when session is null", () => {
    expect(isOrganizerOrAdminSession(null)).toBe(false);
  });
});
