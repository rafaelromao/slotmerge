import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CsrfError,
  assertCsrfFromFormData,
  assertCsrfOrThrow,
  csrfErrorResponse,
  withCsrfProtection,
} from "./csrf";

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

const session = {
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

beforeEach(() => {
  vi.restoreAllMocks();
});

function postRequest(headers: Record<string, string> = {}): Request {
  const formBody = new URLSearchParams({
    _csrf: "csrf-token-1",
    field: "value",
  });
  return new Request("http://localhost:3000/me/foo", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost:3000",
      ...headers,
    },
    body: formBody.toString(),
  });
}

describe("assertCsrfOrThrow", () => {
  it("returns void when the request has a matching CSRF token and origin", async () => {
    await expect(
      assertCsrfOrThrow(postRequest(), session),
    ).resolves.toBeUndefined();
  });

  it("accepts the CSRF token from the x-csrf-token header", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
        "x-csrf-token": "csrf-token-1",
      },
      body: "field=value",
    });

    await expect(assertCsrfOrThrow(request, session)).resolves.toBeUndefined();
  });

  it("throws CsrfError when CSRF token is missing", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: "field=value",
    });

    await expect(assertCsrfOrThrow(request, session)).rejects.toBeInstanceOf(
      CsrfError,
    );
  });

  it("throws CsrfError when CSRF token does not match", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: new URLSearchParams({
        _csrf: "wrong-token",
        field: "value",
      }).toString(),
    });

    await expect(assertCsrfOrThrow(request, session)).rejects.toBeInstanceOf(
      CsrfError,
    );
  });

  it("throws CsrfError when origin does not match APP_PUBLIC_URL", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://evil.example.com",
      },
      body: new URLSearchParams({ _csrf: "csrf-token-1" }).toString(),
    });

    await expect(assertCsrfOrThrow(request, session)).rejects.toBeInstanceOf(
      CsrfError,
    );
  });

  it("throws CsrfError when Sec-Fetch-Site is cross-site", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "cross-site",
      },
      body: new URLSearchParams({ _csrf: "csrf-token-1" }).toString(),
    });

    await expect(assertCsrfOrThrow(request, session)).rejects.toBeInstanceOf(
      CsrfError,
    );
  });

  it("skips the origin check on a safe-method GET request", async () => {
    const request = new Request("http://other.example.com/path", {
      method: "GET",
      headers: {
        "x-csrf-token": "csrf-token-1",
      },
    });

    await expect(assertCsrfOrThrow(request, session)).resolves.toBeUndefined();
  });

  it("accepts Sec-Fetch-Site same-origin", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
        "Sec-Fetch-Site": "same-origin",
      },
      body: new URLSearchParams({ _csrf: "csrf-token-1" }).toString(),
    });

    await expect(assertCsrfOrThrow(request, session)).resolves.toBeUndefined();
  });

  it("consumes the multipart form body via clone so the caller can re-parse it", async () => {
    const formData = new FormData();
    formData.set("_csrf", "csrf-token-1");
    formData.set("field", "value");
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
      },
      body: formData,
    });

    await expect(assertCsrfOrThrow(request, session)).resolves.toBeUndefined();

    const reparsed = await request.formData();
    expect(reparsed.get("field")).toBe("value");
  });
});

describe("assertCsrfFromFormData", () => {
  it("returns void when the form _csrf field matches", () => {
    const formData = new FormData();
    formData.set("_csrf", "csrf-token-1");
    expect(assertCsrfFromFormData(formData, session)).toBeUndefined();
  });

  it("throws CsrfError when the form _csrf field is missing", () => {
    const formData = new FormData();
    formData.set("field", "value");
    expect(() => assertCsrfFromFormData(formData, session)).toThrow(CsrfError);
  });

  it("throws CsrfError when the form _csrf field does not match", () => {
    const formData = new FormData();
    formData.set("_csrf", "wrong-token");
    expect(() => assertCsrfFromFormData(formData, session)).toThrow(CsrfError);
  });
});

describe("CsrfError", () => {
  it("is a generic 403 with no body exposing failure details", async () => {
    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: new URLSearchParams({ _csrf: "wrong-token" }).toString(),
    });

    let thrown: unknown;
    try {
      await assertCsrfOrThrow(request, session);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CsrfError);
    if (thrown instanceof CsrfError) {
      const response = thrown.toResponse();
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
    }
  });
});

describe("csrfErrorResponse", () => {
  it("returns a generic 403 response with no body", async () => {
    const response = csrfErrorResponse();
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
  });
});

describe("withCsrfProtection", () => {
  it("returns a generic 403 response when the wrapped handler fails CSRF", async () => {
    const handler = withCsrfProtection(() => {
      return new Response("ok", { status: 200 });
    });

    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: new URLSearchParams({ _csrf: "wrong-token" }).toString(),
    });

    const response = await handler(request, session);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
  });

  it("passes through the wrapped handler's response when CSRF succeeds", async () => {
    const handler = withCsrfProtection(() => {
      return new Response("ok", { status: 200 });
    });

    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: new URLSearchParams({ _csrf: "csrf-token-1" }).toString(),
    });

    const response = await handler(request, session);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("rethrows non-CSRF errors so they surface to the framework", async () => {
    const handler = withCsrfProtection(() => {
      throw new Error("downstream failure");
    });

    const request = new Request("http://localhost:3000/me/foo", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "http://localhost:3000",
      },
      body: new URLSearchParams({ _csrf: "csrf-token-1" }).toString(),
    });

    await expect(handler(request, session)).rejects.toThrow(
      "downstream failure",
    );
  });
});
