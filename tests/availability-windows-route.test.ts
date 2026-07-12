import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "../app/me/availability-windows/route";
import { PATCH, DELETE } from "../app/me/availability-windows/[id]/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import {
  clearWeeklyAvailabilityWindowOverride,
  setWeeklyAvailabilityWindowRepositoryForTests,
  type WeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowRepository,
  type CreateWeeklyAvailabilityWindow,
} from "../src/profile/availability-windows";

class InMemoryAvailabilityWindowsRepository implements WeeklyAvailabilityWindowRepository {
  private readonly state = new Map<string, WeeklyAvailabilityWindow>();
  private nextId = 1;

  async add(
    userId: string,
    window: CreateWeeklyAvailabilityWindow,
    profileTimezone: string,
  ): Promise<WeeklyAvailabilityWindow> {
    await Promise.resolve();
    const id = `window-${this.nextId++}`;
    const now = new Date("2026-07-12T12:00:00.000Z");
    const record: WeeklyAvailabilityWindow = {
      id,
      userId,
      dayOfWeek: window.dayOfWeek,
      startTime: window.startTime,
      endTime: window.endTime,
      profileTimezone,
      createdAt: now,
      updatedAt: now,
    };
    this.state.set(id, record);
    return record;
  }

  async listByUserId(userId: string): Promise<WeeklyAvailabilityWindow[]> {
    await Promise.resolve();
    return [...this.state.values()].filter((w) => w.userId === userId);
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<WeeklyAvailabilityWindow | null> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    return existing;
  }

  async updateById(
    id: string,
    userId: string,
    updates: {
      dayOfWeek?: number;
      startTime?: string;
      endTime?: string;
    },
  ): Promise<WeeklyAvailabilityWindow | null> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    const updated: WeeklyAvailabilityWindow = {
      ...existing,
      ...(updates.dayOfWeek !== undefined && { dayOfWeek: updates.dayOfWeek }),
      ...(updates.startTime !== undefined && { startTime: updates.startTime }),
      ...(updates.endTime !== undefined && { endTime: updates.endTime }),
      updatedAt: new Date("2026-07-12T12:00:00.000Z"),
    };
    this.state.set(id, updated);
    return updated;
  }

  async removeById(id: string, userId: string): Promise<boolean> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return false;
    }
    this.state.delete(id);
    return true;
  }
}

async function authedSession(
  overrides: {
    profileTimezone?: string | null;
    userId?: string;
    csrfToken?: string;
  } = {},
): Promise<string> {
  setSessionRecord(overrides);
  const userId = overrides.userId ?? "user-1";
  return sealSessionCookie({
    sessionId: `session-for-${userId}`,
  });
}

function authedHeaders(
  cookie: string,
  csrfToken: string = "csrf-token-1",
): Record<string, string> {
  return {
    cookie,
    "x-csrf-token": csrfToken,
    "content-type": "application/json",
  };
}

function makeSessionRecord(
  overrides: {
    profileTimezone?: string | null;
    userId?: string;
    csrfToken?: string;
  } = {},
) {
  const userId = overrides.userId ?? "user-1";
  const csrfToken = overrides.csrfToken ?? "csrf-token-1";
  return {
    user: {
      id: userId,
      email: "user@example.com",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      shortBio: null,
      role: "user" as const,
      status: "active" as const,
      profileTimezone: overrides.profileTimezone ?? "America/New_York",
      bufferMinutes: 0,
    },
    csrfToken,
  };
}

function setSessionRecord(
  overrides: {
    profileTimezone?: string | null;
    userId?: string;
    csrfToken?: string;
  } = {},
) {
  const userId = overrides.userId ?? "user-1";
  const csrfToken = overrides.csrfToken ?? "csrf-token-1";
  const sessionRecord = makeSessionRecord({ ...overrides, userId, csrfToken });
  setSessionRepositoryForTests({
    findById: (sessionId) =>
      Promise.resolve(
        sessionId === `session-for-${userId}` ? sessionRecord : null,
      ),
  });
}

describe("GET /me/availability-windows", () => {
  afterEach(() => {
    clearWeeklyAvailabilityWindowOverride();
  });

  it("returns 401 when no session", async () => {
    const response = await GET(
      new Request("http://localhost/me/availability-windows"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("returns empty array when user has no windows", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await GET(
      new Request("http://localhost/me/availability-windows", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      availabilityWindows: [],
    });
  });

  it("returns the user's windows", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityWindowsRepository();
    setWeeklyAvailabilityWindowRepositoryForTests(repo);

    await repo.add(
      "user-1",
      { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
      "America/New_York",
    );
    await repo.add(
      "user-1",
      { dayOfWeek: 3, startTime: "14:00", endTime: "15:00" },
      "America/New_York",
    );
    await repo.add(
      "user-2",
      { dayOfWeek: 2, startTime: "08:00", endTime: "09:00" },
      "Europe/Lisbon",
    );

    const cookie = await authedSession();
    const response = await GET(
      new Request("http://localhost/me/availability-windows", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      availabilityWindows: Array<{ dayOfWeek: number }>;
    };
    expect(data.availabilityWindows).toHaveLength(2);
    expect(data.availabilityWindows[0].dayOfWeek).toBe(1);
    expect(data.availabilityWindows[1].dayOfWeek).toBe(3);
  });
});

describe("POST /me/availability-windows", () => {
  afterEach(() => {
    clearWeeklyAvailabilityWindowOverride();
  });

  it("returns 401 when no session", async () => {
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF token is missing", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "invalid_csrf" });
  });

  it("returns 400 when profileTimezone is null", async () => {
    const userId = "user-with-no-timezone";
    const sessionRecord = {
      user: {
        id: userId,
        email: "tz@example.com",
        displayName: "TZ User",
        avatarUrl: null,
        shortBio: null,
        role: "user" as const,
        status: "active" as const,
        profileTimezone: null,
        bufferMinutes: 0,
      },
      csrfToken: "csrf-token-tz",
    };
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === `session-for-${userId}` ? sessionRecord : null,
        ),
    });
    const cookie = await sealSessionCookie({
      sessionId: `session-for-${userId}`,
    });
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: authedHeaders(cookie, "csrf-token-tz"),
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "profile_timezone_required",
    });
  });

  it("returns 400 when dayOfWeek is out of range", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          dayOfWeek: 7,
          startTime: "09:00",
          endTime: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_availability_window",
    });
  });

  it("returns 400 when endTime is not after startTime", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "09:00",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_availability_window",
    });
  });

  it("returns 400 for invalid time format", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "9am",
          endTime: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_availability_window",
    });
  });

  it("creates the window and returns it with 201", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityWindowsRepository();
    setWeeklyAvailabilityWindowRepositoryForTests(repo);

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      availabilityWindow: {
        id: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        profileTimezone: string;
      };
    };
    expect(data.availabilityWindow.id).toBeTruthy();
    expect(data.availabilityWindow.dayOfWeek).toBe(1);
    expect(data.availabilityWindow.startTime).toBe("09:00");
    expect(data.availabilityWindow.endTime).toBe("10:00");
    expect(data.availabilityWindow.profileTimezone).toBe("America/New_York");
  });

  it("rejects unexpected extra fields", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-windows", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "10:00",
          foo: "bar",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /me/availability-windows/:id", () => {
  afterEach(() => {
    clearWeeklyAvailabilityWindowOverride();
  });

  it("returns 401 when no session", async () => {
    const response = await PATCH(
      new Request("http://localhost/me/availability-windows/window-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dayOfWeek: 3 }),
      }),
      { params: Promise.resolve({ id: "window-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF token is wrong", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await PATCH(
      new Request("http://localhost/me/availability-windows/window-1", {
        method: "PATCH",
        headers: {
          ...authedHeaders(cookie, "wrong-token"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ dayOfWeek: 3 }),
      }),
      { params: Promise.resolve({ id: "window-1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when window not found", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await PATCH(
      new Request("http://localhost/me/availability-windows/nonexistent", {
        method: "PATCH",
        headers: authedHeaders(cookie),
        body: JSON.stringify({ dayOfWeek: 3 }),
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "availability_window_not_found",
    });
  });

  it("returns 404 when window belongs to another user", async () => {
    setSessionRecord({ userId: "user-1" });
    const repo = new InMemoryAvailabilityWindowsRepository();
    setWeeklyAvailabilityWindowRepositoryForTests(repo);

    await repo.add(
      "user-2",
      { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
      "America/New_York",
    );

    setSessionRecord({ userId: "user-1" });
    const cookie = await authedSession({ userId: "user-1" });
    const response = await PATCH(
      new Request("http://localhost/me/availability-windows/window-1", {
        method: "PATCH",
        headers: authedHeaders(cookie, "csrf-token-1"),
        body: JSON.stringify({ dayOfWeek: 3 }),
      }),
      { params: Promise.resolve({ id: "window-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("updates the window and returns the updated shape", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityWindowsRepository();
    setWeeklyAvailabilityWindowRepositoryForTests(repo);

    const created = await repo.add(
      "user-1",
      { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
      "America/New_York",
    );

    const cookie = await authedSession();
    const response = await PATCH(
      new Request(`http://localhost/me/availability-windows/${created.id}`, {
        method: "PATCH",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          dayOfWeek: 5,
          startTime: "16:00",
          endTime: "17:00",
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      availabilityWindow: {
        dayOfWeek: number;
        startTime: string;
        endTime: string;
      };
    };
    expect(data.availabilityWindow.dayOfWeek).toBe(5);
    expect(data.availabilityWindow.startTime).toBe("16:00");
    expect(data.availabilityWindow.endTime).toBe("17:00");
  });
});

describe("DELETE /me/availability-windows/:id", () => {
  afterEach(() => {
    clearWeeklyAvailabilityWindowOverride();
  });

  it("returns 401 when no session", async () => {
    const response = await DELETE(
      new Request("http://localhost/me/availability-windows/window-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "window-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF token is wrong", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/availability-windows/window-1", {
        method: "DELETE",
        headers: authedHeaders(cookie, "wrong-token"),
      }),
      { params: Promise.resolve({ id: "window-1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when window not found", async () => {
    setSessionRecord();
    setWeeklyAvailabilityWindowRepositoryForTests(
      new InMemoryAvailabilityWindowsRepository(),
    );

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/availability-windows/nonexistent", {
        method: "DELETE",
        headers: authedHeaders(cookie),
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns 204 and removes the window", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityWindowsRepository();
    setWeeklyAvailabilityWindowRepositoryForTests(repo);

    const created = await repo.add(
      "user-1",
      { dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
      "America/New_York",
    );

    const cookie = await authedSession();
    const response = await DELETE(
      new Request(`http://localhost/me/availability-windows/${created.id}`, {
        method: "DELETE",
        headers: authedHeaders(cookie),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(204);

    const windows = await repo.listByUserId("user-1");
    expect(windows).toHaveLength(0);
  });
});
