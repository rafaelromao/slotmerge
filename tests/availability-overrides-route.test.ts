import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "../app/me/availability-overrides/route";
import { DELETE } from "../app/me/availability-overrides/[id]/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import {
  clearAvailabilityOverrideRepository,
  setAvailabilityOverrideRepositoryForTests,
  type AvailabilityOverride,
  type AvailabilityOverrideRepository,
  type CreateAvailabilityOverride,
} from "../src/profile/availability-overrides";

class InMemoryAvailabilityOverrideRepository implements AvailabilityOverrideRepository {
  private readonly state = new Map<string, AvailabilityOverride>();
  private nextId = 1;

  async add(
    userId: string,
    override: CreateAvailabilityOverride,
    profileTimezone: string,
  ): Promise<AvailabilityOverride> {
    await Promise.resolve();
    const id = `override-${this.nextId++}`;
    const now = new Date("2026-07-13T12:00:00.000Z");
    const record: AvailabilityOverride = {
      id,
      userId,
      date: override.date,
      startTime: override.startTime,
      endTime: override.endTime,
      type: override.type,
      profileTimezone,
      createdAt: now,
      updatedAt: now,
    };
    this.state.set(id, record);
    return record;
  }

  async listByUserId(userId: string): Promise<AvailabilityOverride[]> {
    await Promise.resolve();
    return [...this.state.values()].filter((o) => o.userId === userId);
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<AvailabilityOverride | null> {
    await Promise.resolve();
    const existing = this.state.get(id);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    return existing;
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

describe("GET /me/availability-overrides", () => {
  afterEach(() => {
    clearAvailabilityOverrideRepository();
  });

  it("returns 401 when no session", async () => {
    const response = await GET(
      new Request("http://localhost/me/availability-overrides"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthenticated",
    });
  });

  it("returns empty array when user has no overrides", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await GET(
      new Request("http://localhost/me/availability-overrides", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      availabilityOverrides: [],
    });
  });

  it("returns the user's overrides", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityOverrideRepository();
    setAvailabilityOverrideRepositoryForTests(repo);

    await repo.add(
      "user-1",
      { date: "2026-07-20", startTime: "09:00", endTime: "10:00", type: "add" },
      "America/New_York",
    );
    await repo.add(
      "user-1",
      {
        date: "2026-07-21",
        startTime: "14:00",
        endTime: "15:00",
        type: "block",
      },
      "America/New_York",
    );
    await repo.add(
      "user-2",
      { date: "2026-07-22", startTime: "08:00", endTime: "09:00", type: "add" },
      "Europe/Lisbon",
    );

    const cookie = await authedSession();
    const response = await GET(
      new Request("http://localhost/me/availability-overrides", {
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      availabilityOverrides: Array<{ id: string; date: string; type: string }>;
    };
    expect(data.availabilityOverrides).toHaveLength(2);
    expect(data.availabilityOverrides[0].date).toBe("2026-07-20");
    expect(data.availabilityOverrides[1].date).toBe("2026-07-21");
  });
});

describe("POST /me/availability-overrides", () => {
  afterEach(() => {
    clearAvailabilityOverrideRepository();
  });

  it("returns 401 when no session", async () => {
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:00",
          type: "add",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF token is missing", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:00",
          type: "add",
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
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie, "csrf-token-tz"),
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:00",
          type: "add",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "profile_timezone_required",
    });
  });

  it("returns 400 when type is invalid", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:00",
          type: "invalid",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_availability_override",
    });
  });

  it("returns 400 when date format is invalid", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          date: "07-20-2026",
          startTime: "09:00",
          endTime: "10:00",
          type: "add",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_availability_override",
    });
  });

  it("returns 400 when endTime is not after startTime", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "10:00",
          endTime: "09:00",
          type: "add",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_availability_override",
    });
  });

  it("creates add override and returns it with 201", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityOverrideRepository();
    setAvailabilityOverrideRepositoryForTests(repo);

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:00",
          type: "add",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      availabilityOverride: {
        id: string;
        date: string;
        startTime: string;
        endTime: string;
        type: string;
        profileTimezone: string;
      };
    };
    expect(data.availabilityOverride.id).toBeTruthy();
    expect(data.availabilityOverride.date).toBe("2026-07-20");
    expect(data.availabilityOverride.startTime).toBe("09:00");
    expect(data.availabilityOverride.endTime).toBe("10:00");
    expect(data.availabilityOverride.type).toBe("add");
    expect(data.availabilityOverride.profileTimezone).toBe("America/New_York");
  });

  it("creates block override and returns it with 201", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityOverrideRepository();
    setAvailabilityOverrideRepositoryForTests(repo);

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          date: "2026-07-21",
          startTime: "14:00",
          endTime: "15:00",
          type: "block",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      availabilityOverride: {
        id: string;
        type: string;
      };
    };
    expect(data.availabilityOverride.type).toBe("block");
  });

  it("rejects unexpected extra fields", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await POST(
      new Request("http://localhost/me/availability-overrides", {
        method: "POST",
        headers: authedHeaders(cookie),
        body: JSON.stringify({
          date: "2026-07-20",
          startTime: "09:00",
          endTime: "10:00",
          type: "add",
          foo: "bar",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /me/availability-overrides/:id", () => {
  afterEach(() => {
    clearAvailabilityOverrideRepository();
  });

  it("returns 401 when no session", async () => {
    const response = await DELETE(
      new Request("http://localhost/me/availability-overrides/override-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "override-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when CSRF token is wrong", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/availability-overrides/override-1", {
        method: "DELETE",
        headers: {
          ...authedHeaders(cookie, "wrong-token"),
        },
      }),
      { params: Promise.resolve({ id: "override-1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when override not found", async () => {
    setSessionRecord();
    setAvailabilityOverrideRepositoryForTests(
      new InMemoryAvailabilityOverrideRepository(),
    );

    const cookie = await authedSession();
    const response = await DELETE(
      new Request("http://localhost/me/availability-overrides/nonexistent", {
        method: "DELETE",
        headers: authedHeaders(cookie),
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "availability_override_not_found",
    });
  });

  it("returns 404 when override belongs to another user", async () => {
    setSessionRecord({ userId: "user-1" });
    const repo = new InMemoryAvailabilityOverrideRepository();
    setAvailabilityOverrideRepositoryForTests(repo);

    await repo.add(
      "user-2",
      { date: "2026-07-20", startTime: "09:00", endTime: "10:00", type: "add" },
      "America/New_York",
    );

    setSessionRecord({ userId: "user-1" });
    const cookie = await authedSession({ userId: "user-1" });
    const response = await DELETE(
      new Request("http://localhost/me/availability-overrides/override-1", {
        method: "DELETE",
        headers: authedHeaders(cookie, "csrf-token-1"),
      }),
      { params: Promise.resolve({ id: "override-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns 204 and removes the override", async () => {
    setSessionRecord();
    const repo = new InMemoryAvailabilityOverrideRepository();
    setAvailabilityOverrideRepositoryForTests(repo);

    const created = await repo.add(
      "user-1",
      { date: "2026-07-20", startTime: "09:00", endTime: "10:00", type: "add" },
      "America/New_York",
    );

    const cookie = await authedSession();
    const response = await DELETE(
      new Request(`http://localhost/me/availability-overrides/${created.id}`, {
        method: "DELETE",
        headers: authedHeaders(cookie),
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(204);

    const overrides = await repo.listByUserId("user-1");
    expect(overrides).toHaveLength(0);
  });
});
