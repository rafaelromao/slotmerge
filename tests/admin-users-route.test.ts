import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "../app/admin/users/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import {
  setAdminUserRepositoryForTests,
  type AdminUserRepository,
  type ChangeRoleResult,
  type ReinstateResult,
  type SuspendResult,
  type UserListItem,
} from "../src/admin/users";

class InMemoryAdminUserRepository implements AdminUserRepository {
  private rows: UserListItem[] = [
    {
      id: "admin-1",
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
      status: "active",
    },
    {
      id: "user-1",
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      role: "user",
      status: "active",
    },
  ];

  listUsers(): Promise<UserListItem[]> {
    return Promise.resolve([...this.rows]);
  }

  changeRole({
    userId,
    actingAdminId,
    role,
  }: {
    userId: string;
    actingAdminId: string;
    role: "user" | "organizer" | "admin";
  }): Promise<ChangeRoleResult> {
    if (userId === actingAdminId) {
      return Promise.resolve({ ok: false, reason: "self" });
    }
    const target = this.rows.find((r) => r.id === userId);
    if (!target) {
      return Promise.resolve({ ok: false, reason: "not_found" });
    }
    target.role = role;
    return Promise.resolve({ ok: true });
  }

  suspend({
    userId,
    actingAdminId,
  }: {
    userId: string;
    actingAdminId: string;
  }): Promise<SuspendResult> {
    if (userId === actingAdminId) {
      return Promise.resolve({ ok: false, reason: "self" });
    }
    const target = this.rows.find((r) => r.id === userId);
    if (!target) {
      return Promise.resolve({ ok: false, reason: "not_found" });
    }
    if (target.status === "suspended") {
      return Promise.resolve({ ok: false, reason: "already_suspended" });
    }
    target.status = "suspended";
    return Promise.resolve({ ok: true });
  }

  reinstate({
    userId,
    actingAdminId,
  }: {
    userId: string;
    actingAdminId: string;
  }): Promise<ReinstateResult> {
    if (userId === actingAdminId) {
      return Promise.resolve({ ok: false, reason: "self" });
    }
    const target = this.rows.find((r) => r.id === userId);
    if (!target) {
      return Promise.resolve({ ok: false, reason: "not_found" });
    }
    if (target.status === "active") {
      return Promise.resolve({ ok: false, reason: "already_active" });
    }
    target.status = "active";
    return Promise.resolve({ ok: true });
  }
}

async function authedSession(): Promise<string> {
  return sealSessionCookie({ sessionId: "session-1" });
}

function authedCsrfForm(cookie: string): Record<string, string> {
  return {
    cookie,
    "content-type": "application/x-www-form-urlencoded",
  };
}

const sessionRecord = {
  user: {
    id: "admin-1",
    email: "admin@example.com",
    displayName: "Admin",
    avatarUrl: null,
    shortBio: null,
    role: "admin" as const,
    status: "active" as const,
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token-1",
};

describe("GET /admin/users", () => {
  afterEach(() => {
    setSessionRepositoryForTests(null);
    setAdminUserRepositoryForTests(null);
  });

  it("renders the user list HTML for an admin session", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(sessionId === "session-1" ? sessionRecord : null),
    });
    setAdminUserRepositoryForTests(new InMemoryAdminUserRepository());

    const cookie = await authedSession();
    const response = await GET(
      new Request("http://localhost/admin/users", { headers: { cookie } }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("ada@example.com");
    expect(html).toContain('value="csrf-token-1"');
  });

  it("returns 401 when no session is present", async () => {
    setSessionRepositoryForTests({
      findById: () => Promise.resolve(null),
    });

    const response = await GET(new Request("http://localhost/admin/users"));

    expect(response.status).toBe(401);
  });
});

describe("POST /admin/users", () => {
  afterEach(() => {
    setSessionRepositoryForTests(null);
    setAdminUserRepositoryForTests(null);
  });

  it("suspends a user and redirects to /admin/users", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(sessionId === "session-1" ? sessionRecord : null),
    });
    const repository = new InMemoryAdminUserRepository();
    setAdminUserRepositoryForTests(repository);

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/admin/users", {
        method: "POST",
        headers: authedCsrfForm(cookie),
        body: new URLSearchParams({
          _csrf: "csrf-token-1",
          action: "suspend",
          userId: "user-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/users",
    );
    const updated = await repository.listUsers();
    const target = updated.find((u) => u.id === "user-1");
    expect(target?.status).toBe("suspended");
  });

  it("rejects a POST with a mismatched CSRF token", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(sessionId === "session-1" ? sessionRecord : null),
    });
    const repository = new InMemoryAdminUserRepository();
    setAdminUserRepositoryForTests(repository);

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/admin/users", {
        method: "POST",
        headers: authedCsrfForm(cookie),
        body: new URLSearchParams({
          _csrf: "wrong",
          action: "suspend",
          userId: "user-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(403);
    const updated = await repository.listUsers();
    expect(updated.find((u) => u.id === "user-1")?.status).toBe("active");
  });
});
