import { describe, expect, it, vi } from "vitest";

import { createAuthWorkflow, type RequestContext } from "./auth";

const clock = { now: () => new Date("2026-07-15T00:00:00.000Z") };

function context(ipHash: string): RequestContext {
  return { requestId: `request-${ipHash}`, ipHash, userAgent: "vitest" };
}

function repositories() {
  return {
    inviteRepository: {
      findById: vi.fn().mockResolvedValue(null),
      findPendingByEmail: vi.fn().mockResolvedValue(null),
      accept: vi.fn().mockResolvedValue(undefined),
    },
    userRepository: {
      findById: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
  };
}

describe("auth workflow", () => {
  it("returns a typed success for a syntactically valid email", async () => {
    const repos = repositories();
    const workflow = createAuthWorkflow({ clock, ...repos });

    const result = await workflow.requestMagicLink({
      email: "unknown@example.com",
      requestContext: context("client-a"),
    });

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("returns a typed invalid-email error without repository lookup", async () => {
    const repos = repositories();
    const workflow = createAuthWorkflow({ clock, ...repos });

    const result = await workflow.requestMagicLink({
      email: "not-an-email",
      requestContext: context("client-a"),
    });

    expect(result).toEqual({ ok: false, error: "invalid_email" });
    expect(repos.userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it("keeps rate-limit buckets isolated by request context", async () => {
    const repos = repositories();
    const workflow = createAuthWorkflow({ clock, ...repos });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        workflow.requestMagicLink({
          email: "alice@example.com",
          requestContext: context("client-a"),
        }),
      ).resolves.toEqual({ ok: true, value: undefined });
    }

    await expect(
      workflow.requestMagicLink({
        email: "alice@example.com",
        requestContext: context("client-a"),
      }),
    ).resolves.toEqual({ ok: false, error: "rate_limited" });
    await expect(
      workflow.requestMagicLink({
        email: "alice@example.com",
        requestContext: context("client-b"),
      }),
    ).resolves.toEqual({ ok: true, value: undefined });
  });

  it("keeps delivery failure indistinguishable from success", async () => {
    const repos = repositories();
    repos.inviteRepository.findPendingByEmail.mockResolvedValue({
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      magicLinkGeneration: 0,
    });
    const workflow = createAuthWorkflow({
      clock,
      ...repos,
      magicLinkSecret: "test-secret",
      emailDeliveryService: {
        sendEmail: vi.fn().mockRejectedValue(new Error("queue unavailable")),
      },
    });

    const result = await workflow.requestMagicLink({
      email: "alice@example.com",
      requestContext: context("client-a"),
    });

    expect(result).toEqual({ ok: true, value: undefined });
  });
});
