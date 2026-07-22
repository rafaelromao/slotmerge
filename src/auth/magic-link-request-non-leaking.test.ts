import { describe, expect, it, vi } from "vitest";

import { createMagicLinkRequestHandlers } from "./magic-link-request";
import type { EmailDeliveryService } from "../email/service";

function createMockInviteRepository() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findPendingByEmail: vi.fn().mockResolvedValue(null),
    accept: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockUserRepository() {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  };
}

function createMockEmailDeliveryService(): EmailDeliveryService & {
  sends: Array<{ recipient: string; type: string }>;
} {
  const sends: Array<{ recipient: string; type: string }> = [];
  return {
    sends,
    sendEmail: vi.fn(async (input) => {
      sends.push({
        recipient: input.recipient,
        type: input.type,
      });
      const now = new Date();
      return {
        emailEvent: {
          id: "evt-1",
          recipient: input.recipient,
          type: input.type,
          payloadReference: "ref-test",
          status: "sent",
          attempts: 0,
          createdAt: now,
          updatedAt: now,
          sentAt: now,
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      };
    }),
  };
}

function buildHandlers(
  options: Parameters<typeof createMagicLinkRequestHandlers>[0],
) {
  return createMagicLinkRequestHandlers({
    emailDeliveryService: createMockEmailDeliveryService(),
    ...options,
  });
}

describe("magic link request handler - non-leaking 202 contract", () => {
  it("returns 202 for an invited email with a pending invite", async () => {
    const mockInviteRepo = createMockInviteRepository();
    mockInviteRepo.findPendingByEmail.mockResolvedValue({
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });

    const mockUserRepo = createMockUserRepository();

    const { POST } = buildHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      userRepository: mockUserRepo,
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "alice@example.com" }),
      }),
    );

    expect(response.status).toBe(202);
    expect(mockInviteRepo.findPendingByEmail).toHaveBeenCalledWith(
      "alice@example.com",
    );
  });

  it("returns 202 for an unknown email (no leak)", async () => {
    const mockInviteRepo = createMockInviteRepository();
    const mockUserRepo = createMockUserRepository();

    const { POST } = buildHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      userRepository: mockUserRepo,
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "unknown@example.com" }),
      }),
    );

    expect(response.status).toBe(202);
  });

  it("returns 202 for a suspended email (no leak)", async () => {
    const mockInviteRepo = createMockInviteRepository();
    const mockUserRepo = createMockUserRepository();
    mockUserRepo.findByEmail.mockResolvedValue({
      id: "user-1",
      email: "suspended@example.com",
      role: "user",
      status: "suspended",
    });

    const { POST } = buildHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      userRepository: mockUserRepo,
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "suspended@example.com" }),
      }),
    );

    expect(response.status).toBe(202);
  });

  it("returns indistinguishable responses for invited and uninvited emails", async () => {
    const mockInviteRepo = createMockInviteRepository();
    mockInviteRepo.findPendingByEmail.mockImplementation((email) =>
      email === "invited@example.com"
        ? Promise.resolve({
            id: "invite-1",
            email: "invited@example.com",
            role: "user",
            status: "pending",
            expiresAt: new Date("2026-08-11T00:00:00.000Z"),
          })
        : Promise.resolve(null),
    );

    const mockUserRepo = createMockUserRepository();

    const { POST } = buildHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      userRepository: mockUserRepo,
    });

    const invitedResponse = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "invited@example.com" }),
      }),
    );
    const uninvitedResponse = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "uninvited@example.com" }),
      }),
    );

    expect(invitedResponse.status).toBe(uninvitedResponse.status);
    expect(invitedResponse.status).toBe(202);
  });

  it("returns 400 for invalid_email (syntactic only)", async () => {
    const { POST } = buildHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("invalid_email");
  });

  it("returns 429 when rate-limited, even for unknown emails", async () => {
    const mockInviteRepo = createMockInviteRepository();
    const mockUserRepo = createMockUserRepository();
    const request = () =>
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ email: "unknown@example.com" }),
        headers: { "x-forwarded-for": "10.0.0.99" },
      });

    const { POST } = buildHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      userRepository: mockUserRepo,
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(request());
      expect(response.status).toBe(202);
    }

    const response = await POST(request());
    expect(response.status).toBe(429);
  });
});
