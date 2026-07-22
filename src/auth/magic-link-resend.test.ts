import { describe, expect, it, vi } from "vitest";

import { createMagicLinkResendHandlers } from "./magic-link-resend";
import { createMagicLinkTokenIssuer } from "./magic-link";
import type { AuthWorkflow } from "../workflow/auth";

const clock = { now: () => new Date("2026-07-15T00:00:00.000Z") };

type MockInvite = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  magicLinkGeneration: number;
};

function expiredToken(generation = 0): string {
  return createMagicLinkTokenIssuer({
    clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
    baseUrl: "https://slotmerge.example.com",
    secret: "test-secret",
  }).issueMagicLinkToken({
    inviteId: "invite-1",
    email: "alice@example.com",
    expiresAt: new Date("2026-07-14T00:00:00.000Z"),
    generation,
  }).token;
}

function invite(generation = 0): MockInvite {
  return {
    id: "invite-1",
    email: "alice@example.com",
    role: "user",
    status: "pending",
    expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    magicLinkGeneration: generation,
  };
}

function repository(record = invite()) {
  return {
    findById: vi.fn().mockResolvedValue(record),
    setMagicLinkGeneration: vi.fn().mockResolvedValue(record),
    incrementGeneration: vi
      .fn()
      .mockResolvedValue({ ...record, magicLinkGeneration: 1 }),
  };
}

function request(token = expiredToken()): Request {
  return new Request("http://localhost/auth/magic-link/resend", {
    method: "POST",
    headers: { "x-forwarded-for": "10.0.0.1" },
    body: new URLSearchParams({ token }),
  });
}

describe("magic link resend handler", () => {
  it("requests a fresh link through authWorkflow for an expired valid invite token", async () => {
    const inviteRepository = repository();
    const requestMagicLink = vi
      .fn<AuthWorkflow["requestMagicLink"]>()
      .mockResolvedValue({ ok: true, value: undefined });
    const { POST } = createMagicLinkResendHandlers({
      clock,
      magicLinkSecret: "test-secret",
      inviteRepository,
      requestMagicLink,
      rateLimiter: { allow: () => true },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("fresh magic link");
    expect(html).not.toContain("alice@example.com");
    expect(inviteRepository.incrementGeneration).toHaveBeenCalledWith(
      "invite-1",
    );
    expect(requestMagicLink).toHaveBeenCalledTimes(1);
    const input = requestMagicLink.mock.calls[0]?.[0];
    expect(input?.email).toBe("alice@example.com");
    expect(input?.requestContext.ipHash).toMatch(/\S+/);
  });

  it("rejects an expired token from an older generation", async () => {
    const inviteRepository = repository(invite(1));
    const requestMagicLink = vi.fn();
    const { POST } = createMagicLinkResendHandlers({
      clock,
      magicLinkSecret: "test-secret",
      inviteRepository,
      requestMagicLink,
      rateLimiter: { allow: () => true },
    });

    const response = await POST(request(expiredToken(0)));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("invalid_token");
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("returns 429 without requesting a link when resend is rate-limited", async () => {
    const inviteRepository = repository();
    const requestMagicLink = vi.fn();
    const { POST } = createMagicLinkResendHandlers({
      clock,
      magicLinkSecret: "test-secret",
      inviteRepository,
      requestMagicLink,
      rateLimiter: { allow: () => false },
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(inviteRepository.incrementGeneration).not.toHaveBeenCalled();
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it("restores the generation when the workflow rejects the request", async () => {
    const inviteRepository = repository();
    const requestMagicLink = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "request_failed" });
    const { POST } = createMagicLinkResendHandlers({
      clock,
      magicLinkSecret: "test-secret",
      inviteRepository,
      requestMagicLink,
      rateLimiter: { allow: () => true },
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(inviteRepository.setMagicLinkGeneration).toHaveBeenCalledWith(
      "invite-1",
      0,
    );
  });
});
