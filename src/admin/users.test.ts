import { describe, expect, it, vi } from "vitest";

import { createAdminUsersHandlers } from "./users";

describe("admin users", () => {
  it("lists every user with their email, role, and status for an Admin session", async () => {
    const { GET } = createAdminUsersHandlers({
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
      userRepository: {
        listUsers: vi.fn().mockResolvedValue([
          {
            id: "user-1",
            email: "ada@example.com",
            displayName: "Ada Lovelace",
            role: "user",
            status: "active",
          },
          {
            id: "user-2",
            email: "grace@example.com",
            displayName: null,
            role: "organizer",
            status: "suspended",
          },
        ]),
        changeRole: vi.fn(),
        suspend: vi.fn(),
        reinstate: vi.fn(),
        findActiveUserByEmail: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/users"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Users");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("grace@example.com");
    expect(html).toContain("User");
    expect(html).toContain("Organizer");
    expect(html).toContain("Active");
    expect(html).toContain("Suspended");
    expect(html).toContain('name="_csrf"');
    expect(html).toContain("csrf-token-1");
    expect(html).toContain('value="suspend"');
    expect(html).toContain('value="reinstate"');
    expect(html).toContain("Suspend</button>");
    expect(html).toContain("Reinstate</button>");
  });

  it("renders an empty-state row when no users exist", async () => {
    const { GET } = createAdminUsersHandlers({
      getSession: vi.fn().mockResolvedValue(adminSession()),
      userRepository: {
        listUsers: vi.fn().mockResolvedValue([]),
        changeRole: vi.fn(),
        suspend: vi.fn(),
        reinstate: vi.fn(),
        findActiveUserByEmail: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/users"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("No users yet.");
  });

  it("returns 401 when no session is present on GET /admin/users", async () => {
    const { GET } = createAdminUsersHandlers({
      getSession: vi.fn().mockResolvedValue(null),
      userRepository: {
        listUsers: vi.fn(),
        changeRole: vi.fn(),
        suspend: vi.fn(),
        reinstate: vi.fn(),
        findActiveUserByEmail: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/users"));
    const html = await response.text();

    expect(response.status).toBe(401);
    expect(html).toContain("Sign in required.");
  });

  it("returns 403 when a non-admin session is present on GET /admin/users", async () => {
    const { GET } = createAdminUsersHandlers({
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
      userRepository: {
        listUsers: vi.fn(),
        changeRole: vi.fn(),
        suspend: vi.fn(),
        reinstate: vi.fn(),
        findActiveUserByEmail: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/users"));
    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain("Admin access required.");
  });

  describe("change-role", () => {
    it("calls the repository with the parsed inputs and redirects on success", async () => {
      const changeRole = vi.fn().mockResolvedValue({ ok: true });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole,
          suspend: vi.fn(),
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "change-role",
            userId: "user-2",
            role: "organizer",
          }).toString(),
        }),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/admin/users",
      );
      expect(changeRole).toHaveBeenCalledWith({
        userId: "user-2",
        actingAdminId: "admin-1",
        role: "organizer",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        now: expect.any(Date),
      });
    });

    it("returns 400 and does not call the repository when role is invalid", async () => {
      const changeRole = vi.fn();

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole,
          suspend: vi.fn(),
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "change-role",
            userId: "user-2",
            role: "not-a-role",
          }).toString(),
        }),
      );

      expect(response.status).toBe(400);
      expect(changeRole).not.toHaveBeenCalled();
    });

    it("returns 409 with a self message when the admin targets themselves", async () => {
      const changeRole = vi.fn().mockResolvedValue({
        ok: false,
        reason: "self",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole,
          suspend: vi.fn(),
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "change-role",
            userId: "admin-1",
            role: "user",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("Admins cannot change their own role");
    });

    it("returns 409 with a not-found message when the user does not exist", async () => {
      const changeRole = vi.fn().mockResolvedValue({
        ok: false,
        reason: "not_found",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole,
          suspend: vi.fn(),
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "change-role",
            userId: "missing",
            role: "admin",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("User not found.");
    });
  });

  describe("suspend", () => {
    it("calls the repository with actingAdminId and redirects on success", async () => {
      const suspend = vi.fn().mockResolvedValue({ ok: true });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend,
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "suspend",
            userId: "user-2",
          }).toString(),
        }),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/admin/users",
      );
      expect(suspend).toHaveBeenCalledWith({
        userId: "user-2",
        actingAdminId: "admin-1",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        now: expect.any(Date),
      });
    });

    it("returns 409 with already-suspended when the user is already suspended", async () => {
      const suspend = vi.fn().mockResolvedValue({
        ok: false,
        reason: "already_suspended",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend,
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "suspend",
            userId: "user-2",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("already suspended");
    });

    it("returns 409 with self message when the admin suspends themselves", async () => {
      const suspend = vi.fn().mockResolvedValue({
        ok: false,
        reason: "self",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend,
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "suspend",
            userId: "admin-1",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("cannot suspend themselves");
    });

    it("returns 403 when CSRF token is invalid", async () => {
      const suspend = vi.fn();

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend,
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "wrong",
            action: "suspend",
            userId: "user-2",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(403);
      expect(html).toContain("Invalid CSRF token.");
      expect(suspend).not.toHaveBeenCalled();
    });

    it("returns 401 when no admin session is present", async () => {
      const suspend = vi.fn();

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(null),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend,
          reinstate: vi.fn(),
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "suspend",
            userId: "user-2",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(401);
      expect(html).toContain("Sign in required.");
      expect(suspend).not.toHaveBeenCalled();
    });
  });

  describe("reinstate", () => {
    it("calls the repository with actingAdminId and redirects on success", async () => {
      const reinstate = vi.fn().mockResolvedValue({ ok: true });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend: vi.fn(),
          reinstate,
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "reinstate",
            userId: "user-2",
          }).toString(),
        }),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/admin/users",
      );
      expect(reinstate).toHaveBeenCalledWith({
        userId: "user-2",
        actingAdminId: "admin-1",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        now: expect.any(Date),
      });
    });

    it("returns 409 with already-active when the user is already active", async () => {
      const reinstate = vi.fn().mockResolvedValue({
        ok: false,
        reason: "already_active",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend: vi.fn(),
          reinstate,
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "reinstate",
            userId: "user-2",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("already active");
    });

    it("returns 409 with self message when the admin reinstates themselves", async () => {
      const reinstate = vi.fn().mockResolvedValue({
        ok: false,
        reason: "self",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend: vi.fn(),
          reinstate,
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "reinstate",
            userId: "admin-1",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("cannot reinstate themselves");
    });

    it("returns 409 with not-found when the user is missing", async () => {
      const reinstate = vi.fn().mockResolvedValue({
        ok: false,
        reason: "not_found",
      });

      const { POST } = createAdminUsersHandlers({
        getSession: vi.fn().mockResolvedValue(adminSession()),
        userRepository: {
          listUsers: vi.fn().mockResolvedValue([]),
          changeRole: vi.fn(),
          suspend: vi.fn(),
          reinstate,
          findActiveUserByEmail: vi.fn(),
        },
      });

      const response = await POST(
        new Request("http://localhost/admin/users", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            _csrf: "csrf-token-1",
            action: "reinstate",
            userId: "missing",
          }).toString(),
        }),
      );
      const html = await response.text();

      expect(response.status).toBe(409);
      expect(html).toContain("User not found.");
    });
  });
});

function adminSession() {
  return {
    user: {
      id: "admin-1",
      email: "admin@example.com",
      displayName: null,
      avatarUrl: null,
      shortBio: null,
      role: "admin" as const,
      status: "active" as const,
      profileTimezone: null,
      bufferMinutes: 0,
    },
    csrfToken: "csrf-token-1",
  };
}
