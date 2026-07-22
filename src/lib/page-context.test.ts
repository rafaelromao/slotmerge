import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertRole, requirePageContext } from "./page-context";
import {
  sealSessionCookieValue,
  type SessionRepository,
} from "../auth/session";

vi.mock("../config/runtime", async () => {
  const actual =
    await vi.importActual<typeof import("../config/runtime")>(
      "../config/runtime",
    );
  return {
    ...actual,
    loadRuntimeConfig: () => ({
      appBaseUrl: "http://localhost:3000",
      appEnv: "test" as const,
      appPublicUrl: "http://localhost:3000",
      calendarProviderMode: "mock" as const,
      calendarTokenEncryptionKey:
        "local-calendar-token-encryption-key-do-not-use-in-production",
      databaseUrl: "postgresql://test/test",
      emailAdapter: "mock" as const,
      localProviderOverrideUrl: undefined,
      magicLinkSecret: "local-magic-link-secret-do-not-use-in-production",
      requirePublicWebhookHttps: false,
      sessionSecret: "test-session-secret-at-least-32-characters",
      usesGcpSecretManager: false,
    }),
  };
});

const baseSession = {
  user: {
    id: "user-1",
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: null,
    shortBio: null,
    role: "user" as const,
    status: "active" as const,
    profileTimezone: null,
    bufferMinutes: 0,
  },
  csrfToken: "csrf-token-1",
};

const fakeSessionRepository = {
  findById: vi.fn(() => Promise.resolve(baseSession)),
  delete: vi.fn(() => Promise.resolve()),
};

const fakeSessionRepositorySuspended = {
  findById: vi.fn(() =>
    Promise.resolve({
      ...baseSession,
      user: { ...baseSession.user, status: "suspended" as const },
    }),
  ),
};

const fakeSessionRepositoryNull = {
  findById: vi.fn(() => Promise.resolve(null)),
};

beforeEach(() => {
  fakeSessionRepository.findById.mockClear();
  fakeSessionRepositorySuspended.findById.mockClear();
  fakeSessionRepositoryNull.findById.mockClear();
});

async function cookieForSessionId(sessionId: string): Promise<string> {
  const sealed = await sealSessionCookieValue({ sessionId });
  return `slotmerge_session=${encodeURIComponent(sealed)}`;
}

async function setSessionRepositoryForTests(
  repo: SessionRepository,
): Promise<void> {
  const sessionModule = await import("../auth/session");
  sessionModule.setSessionRepositoryForTests(repo);
}

async function expectRedirect(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      error.response instanceof Response
    ) {
      return error.response;
    }
    throw error;
  }
  throw new Error("expected redirect");
}

describe("assertRole", () => {
  it("returns true when role is in the allowed list", () => {
    expect(assertRole(baseSession, ["user", "organizer", "admin"])).toBe(true);
  });

  it("returns false when role is not in the allowed list", () => {
    expect(assertRole(baseSession, ["admin"])).toBe(false);
  });

  it("returns false when session is null", () => {
    expect(assertRole(null, ["user"])).toBe(false);
  });
});

describe("requirePageContext", () => {
  it("returns the page context for an authenticated user with allowed role", async () => {
    await setSessionRepositoryForTests(fakeSessionRepository);
    const request = new Request("http://localhost/searches", {
      headers: {
        cookie: await cookieForSessionId("session-1"),
      },
    });

    const context = await requirePageContext(
      { roles: ["user", "organizer", "admin"] },
      request,
    );

    expect(context.user).toEqual(baseSession.user);
    expect(context.csrfToken).toBe("csrf-token-1");
    expect(context.isAuthed).toBe(true);
    expect(context.isAdmin).toBe(false);
    expect(context.isOrganizerOrAdmin).toBe(false);
  });

  it("returns isAdmin=true for admin role", async () => {
    await setSessionRepositoryForTests({
      findById: vi.fn(() =>
        Promise.resolve({
          ...baseSession,
          user: { ...baseSession.user, role: "admin" as const },
        }),
      ),
    });
    const request = new Request("http://localhost/admin", {
      headers: {
        cookie: await cookieForSessionId("session-admin"),
      },
    });

    const context = await requirePageContext({ roles: ["admin"] }, request);

    expect(context.isAdmin).toBe(true);
    expect(context.isOrganizerOrAdmin).toBe(true);
  });

  it("returns isOrganizerOrAdmin=true for organizer role", async () => {
    await setSessionRepositoryForTests({
      findById: vi.fn(() =>
        Promise.resolve({
          ...baseSession,
          user: { ...baseSession.user, role: "organizer" as const },
        }),
      ),
    });
    const request = new Request("http://localhost/searches", {
      headers: {
        cookie: await cookieForSessionId("session-or"),
      },
    });

    const context = await requirePageContext(
      { roles: ["organizer", "admin"] },
      request,
    );

    expect(context.isAdmin).toBe(false);
    expect(context.isOrganizerOrAdmin).toBe(true);
  });

  it("treats a suspended user as unauthenticated and redirects to /sign-in", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositorySuspended);
    const request = new Request("http://localhost/searches", {
      headers: {
        cookie: await cookieForSessionId("session-suspended"),
      },
    });

    const response = await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "/sign-in?returnTo=%2Fsearches",
    );
  });

  it("redirects to /sign-in when the session is missing", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/me");

    const response = await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/sign-in?returnTo=%2Fme");
  });

  it("includes a safe relative path in the returnTo query string", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/searches/abc/results");

    const response = await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/sign-in\?returnTo=/);
    expect(decodeURIComponent(location)).toBe(
      "/sign-in?returnTo=/searches/abc/results",
    );
  });

  it("strips an unsafe returnTo target and redirects to /sign-in only", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/?returnTo=//evil.com");

    const response = await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/sign-in");
  });

  it("strips an absolute returnTo target and redirects to /sign-in only", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request(
      "http://localhost/?returnTo=https://evil.com/foo",
    );

    const response = await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/sign-in");
  });

  it("strips a path-traversal returnTo target and redirects to /sign-in only", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/?returnTo=/../etc/passwd");

    const response = await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/sign-in");
  });

  it("calls notFound() when the role does not match", async () => {
    await setSessionRepositoryForTests(fakeSessionRepository);
    const request = new Request("http://localhost/admin", {
      headers: {
        cookie: await cookieForSessionId("session-1"),
      },
    });

    let thrown: unknown;
    try {
      await requirePageContext({ roles: ["admin"] }, request);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(String(thrown)).toContain("NEXT_HTTP_ERROR_FALLBACK");
    expect(String(thrown)).toContain("404");
  });
});
