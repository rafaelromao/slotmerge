import { describe, expect, it, vi } from "vitest";

import { createAdminTopicsHandlers } from "./topics";

describe("admin topics", () => {
  const mockActiveTopic = {
    id: "topic-1",
    name: "Sailing",
    status: "active" as const,
    retiredAt: null,
    createdAt: new Date(),
  };

  it("renders a list of active topics with retire forms", async () => {
    const { GET } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([mockActiveTopic]),
        retire: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/topics"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Sailing");
    expect(html).toContain("Active");
    expect(html).toContain('name="action" value="retire"');
    expect(html).toContain('name="_csrf"');
    expect(html).toContain('value="csrf-token-1"');
    expect(html).toContain("Retire");
  });

  it("shows empty state when no active topics", async () => {
    const { GET } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([]),
        retire: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/topics"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("No active topics");
  });

  it("retires a topic and redirects", async () => {
    const retire = vi.fn().mockResolvedValue({ ok: true });

    const { POST } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([mockActiveTopic]),
        retire,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/topics", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "topic-1",
          action: "retire",
          _csrf: "csrf-token-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/topics",
    );
    expect(retire).toHaveBeenCalledWith({
      id: "topic-1",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      now: expect.any(Date),
    });
  });

  it("shows error when topic not found", async () => {
    const retire = vi.fn().mockResolvedValue({
      ok: false,
      reason: "not_found",
    });

    const { POST } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([mockActiveTopic]),
        retire,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/topics", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "topic-1",
          action: "retire",
          _csrf: "csrf-token-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(409);
    const html = await response.text();
    expect(html).toContain("Topic not found.");
  });

  it("shows error when topic already retired", async () => {
    const retire = vi.fn().mockResolvedValue({
      ok: false,
      reason: "already_retired",
    });

    const { POST } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([mockActiveTopic]),
        retire,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/topics", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "topic-1",
          action: "retire",
          _csrf: "csrf-token-1",
        }).toString(),
      }),
    );

    expect(response.status).toBe(409);
    const html = await response.text();
    expect(html).toContain("This topic is already retired.");
  });

  it("returns 403 for wrong CSRF token", async () => {
    const retire = vi.fn();

    const { POST } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([mockActiveTopic]),
        retire,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/topics", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          id: "topic-1",
          action: "retire",
          _csrf: "wrong-csrf-token",
        }).toString(),
      }),
    );

    expect(response.status).toBe(403);
    expect(retire).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin session", async () => {
    const { GET, POST } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "user-1",
          email: "user@example.com",
          displayName: null,
          role: "user",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([]),
        retire: vi.fn(),
      },
    });

    const getResponse = await GET(new Request("http://localhost/admin/topics"));
    expect(getResponse.status).toBe(403);

    const postResponse = await POST(
      new Request("http://localhost/admin/topics", {
        method: "POST",
      }),
    );
    expect(postResponse.status).toBe(403);
  });

  it("returns 401 for unauthenticated session", async () => {
    const { GET, POST } = createAdminTopicsHandlers({
      getSession: vi.fn().mockResolvedValue(null),
      topicRepository: {
        listActiveAdminTopics: vi.fn().mockResolvedValue([]),
        retire: vi.fn(),
      },
    });

    const getResponse = await GET(new Request("http://localhost/admin/topics"));
    expect(getResponse.status).toBe(401);

    const postResponse = await POST(
      new Request("http://localhost/admin/topics", {
        method: "POST",
      }),
    );
    expect(postResponse.status).toBe(401);
  });
});
