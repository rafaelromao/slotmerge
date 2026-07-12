import { describe, expect, it, vi } from "vitest";

import { createMagicLinkRequestHandlers } from "./magic-link-request";
import { createMagicLinkTokenIssuer } from "./magic-link";

function createMockInviteRepository() {
  return {
    findById: vi.fn(),
    setMagicLinkGeneration: vi.fn(),
  };
}

function createMockEmailDeliveryService() {
  return {
    sendEmail: vi.fn(),
  };
}

describe("magic link request handler", () => {
  it("sends a fresh magic link to the invited email", async () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: () => new Date("2026-07-12T00:00:00.000Z"),
      baseUrl: "https://slotmerge.example.com",
      secret: "test-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-07-10T00:00:00.000Z"),
      generation: 0,
    });

    const invite = {
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending" as const,
      magicLinkGeneration: 0,
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    };

    const mockInviteRepo = createMockInviteRepository();
    mockInviteRepo.findById.mockResolvedValue(invite);
    mockInviteRepo.setMagicLinkGeneration.mockResolvedValue({
      ...invite,
      magicLinkGeneration: 1,
    });

    const mockEmailService = createMockEmailDeliveryService();
    mockEmailService.sendEmail.mockResolvedValue({
      emailEvent: { id: "email-event-1" },
    });

    const { POST } = createMagicLinkRequestHandlers({
      clock: () => new Date("2026-07-15T00:00:00.000Z"),
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      emailDeliveryService: mockEmailService,
      rateLimiter: { allow: () => true },
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      }),
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("fresh magic link");

    expect(mockInviteRepo.findById).toHaveBeenCalledWith("invite-1");
    expect(mockInviteRepo.setMagicLinkGeneration).toHaveBeenCalledWith(
      "invite-1",
      1,
    );
    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: "alice@example.com",
        type: "magic-link",
        payload: expect.objectContaining({
          inviteId: "invite-1",
          email: "alice@example.com",
          generation: 1,
        }),
      }),
    );
  });

  it("rotates the magic-link generation on repeated requests", async () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: () => new Date("2026-07-12T00:00:00.000Z"),
      baseUrl: "https://slotmerge.example.com",
      secret: "test-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-07-10T00:00:00.000Z"),
      generation: 0,
    });

    let currentGeneration = 0;
    const invite = {
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending" as const,
      magicLinkGeneration: 0,
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    };

    const mockInviteRepo = createMockInviteRepository();
    mockInviteRepo.findById.mockImplementation(async () => ({
      ...invite,
      magicLinkGeneration: currentGeneration,
    }));
    mockInviteRepo.setMagicLinkGeneration.mockImplementation(
      async (_id, nextGeneration) => {
        currentGeneration = nextGeneration;
        return {
          ...invite,
          magicLinkGeneration: nextGeneration,
        };
      },
    );

    const mockEmailService = createMockEmailDeliveryService();
    mockEmailService.sendEmail.mockResolvedValue({
      emailEvent: { id: "email-event-1" },
    });

    const { POST } = createMagicLinkRequestHandlers({
      clock: () => new Date("2026-07-15T00:00:00.000Z"),
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      emailDeliveryService: mockEmailService,
      rateLimiter: { allow: () => true },
    });

    await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      }),
    );
    await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      }),
    );

    expect(
      mockEmailService.sendEmail.mock.calls[0]?.[0]?.payload,
    ).toMatchObject({ generation: 1 });
    expect(
      mockEmailService.sendEmail.mock.calls[1]?.[0]?.payload,
    ).toMatchObject({ generation: 2 });
  });

  it("returns a rate-limited response without sending email", async () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: () => new Date("2026-07-12T00:00:00.000Z"),
      baseUrl: "https://slotmerge.example.com",
      secret: "test-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-07-10T00:00:00.000Z"),
      generation: 0,
    });

    const mockInviteRepo = createMockInviteRepository();
    mockInviteRepo.findById.mockResolvedValue({
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending",
      magicLinkGeneration: 0,
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    });

    const mockEmailService = createMockEmailDeliveryService();

    const { POST } = createMagicLinkRequestHandlers({
      clock: () => new Date("2026-07-15T00:00:00.000Z"),
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      emailDeliveryService: mockEmailService,
      rateLimiter: { allow: () => false },
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      }),
    );

    expect(response.status).toBe(429);
    expect(mockInviteRepo.setMagicLinkGeneration).not.toHaveBeenCalled();
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("rolls back the generation if email delivery fails", async () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: () => new Date("2026-07-12T00:00:00.000Z"),
      baseUrl: "https://slotmerge.example.com",
      secret: "test-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-07-10T00:00:00.000Z"),
      generation: 0,
    });

    let currentGeneration = 0;
    const invite = {
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending" as const,
      magicLinkGeneration: 0,
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
    };

    const mockInviteRepo = createMockInviteRepository();
    mockInviteRepo.findById.mockImplementation(async () => ({
      ...invite,
      magicLinkGeneration: currentGeneration,
    }));
    mockInviteRepo.setMagicLinkGeneration.mockImplementation(
      async (_id, nextGeneration) => {
        currentGeneration = nextGeneration;
        return {
          ...invite,
          magicLinkGeneration: nextGeneration,
        };
      },
    );

    const mockEmailService = createMockEmailDeliveryService();
    mockEmailService.sendEmail.mockRejectedValue(new Error("queue failed"));

    const { POST } = createMagicLinkRequestHandlers({
      clock: () => new Date("2026-07-15T00:00:00.000Z"),
      magicLinkSecret: "test-secret",
      inviteRepository: mockInviteRepo,
      emailDeliveryService: mockEmailService,
      rateLimiter: { allow: () => true },
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/request", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      }),
    );

    expect(response.status).toBe(502);
    expect(mockInviteRepo.setMagicLinkGeneration).toHaveBeenNthCalledWith(
      1,
      "invite-1",
      1,
    );
    expect(mockInviteRepo.setMagicLinkGeneration).toHaveBeenNthCalledWith(
      2,
      "invite-1",
      0,
    );
    expect(currentGeneration).toBe(0);
  });
});
