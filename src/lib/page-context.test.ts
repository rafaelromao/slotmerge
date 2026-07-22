import { beforeEach, describe, expect, it, vi } from "vitest";

import { assertRole, requirePageContext } from "./page-context";
import {
  sealSessionCookieValue,
  type SessionRepository,
} from "../auth/session";

const redirectMock = vi.fn();
const notFoundMock = vi.fn();

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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirectMock(url);
    const error = new Error("NEXT_REDIRECT");
    (error as Error & { digest?: string }).digest = `NEXT_REDIRECT;307;${url};`;
    throw error;
  },
  notFound: () => {
    notFoundMock();
    const error = new Error("NEXT_NOT_FOUND");
    (error as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw error;
  },
}));

const headersMock = vi.fn();
const cookiesMock = vi.fn();

/* eslint-disable @typescript-eslint/no-unsafe-return */
vi.mock("next/headers", () => {
  return {
    headers: () => headersMock(),
    cookies: () => cookiesMock(),
  };
});
/* eslint-enable @typescript-eslint/no-unsafe-return */

beforeEach(() => {
  headersMock.mockReset();
  cookiesMock.mockReset();
  headersMock.mockResolvedValue({
    forEach: () => undefined,
  });
  cookiesMock.mockResolvedValue({
    toString: () => "",
  });
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
  redirectMock.mockClear();
  notFoundMock.mockClear();
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

async function expectRedirect(
  promise: Promise<unknown>,
  expectedLocation: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      const digest = (error as Error & { digest?: string }).digest ?? "";
      if (digest.startsWith("NEXT_REDIRECT")) {
        expect(decodeURIComponent(digest)).toContain(expectedLocation);
        return;
      }
    }
    throw error;
  }
  throw new Error("expected redirect");
}

async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_NOT_FOUND") {
      expect(notFoundMock).toHaveBeenCalled();
      return;
    }
    throw error;
  }
  throw new Error("expected notFound");
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

    await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
      "/sign-in?returnTo=/searches",
    );
  });

  it("redirects to /sign-in when the session is missing", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/me");

    await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
      "/sign-in?returnTo=/me",
    );
  });

  it("includes a safe relative path in the returnTo query string", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/searches/abc/results");

    await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
      "/sign-in?returnTo=/searches/abc/results",
    );
  });

  it("strips an unsafe returnTo target and redirects to /sign-in only", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/?returnTo=//evil.com");

    await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
      "/sign-in",
    );
  });

  it("strips an absolute returnTo target and redirects to /sign-in only", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request(
      "http://localhost/?returnTo=https://evil.com/foo",
    );

    await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
      "/sign-in",
    );
  });

  it("strips a path-traversal returnTo target and redirects to /sign-in only", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    const request = new Request("http://localhost/?returnTo=/../etc/passwd");

    await expectRedirect(
      requirePageContext({ roles: ["user"] }, request),
      "/sign-in",
    );
  });

  it("calls notFound() when the role does not match", async () => {
    await setSessionRepositoryForTests(fakeSessionRepository);
    const request = new Request("http://localhost/admin", {
      headers: {
        cookie: await cookieForSessionId("session-1"),
      },
    });

    await expectNotFound(requirePageContext({ roles: ["admin"] }, request));
  });

  it("uses the middleware-supplied x-url header when no request is passed", async () => {
    await setSessionRepositoryForTests(fakeSessionRepositoryNull);
    headersMock.mockResolvedValue({
      forEach: (cb: (value: string, key: string) => void) => {
        cb("http://localhost/admin", "x-url");
      },
    });

    await expectRedirect(
      requirePageContext({ roles: ["admin"] }),
      "/sign-in?returnTo=/admin",
    );
  });
});
