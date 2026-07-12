import { describe, expect, it, vi } from "vitest";

import { createMagicLinkTokenIssuer } from "./magic-link";
import { createMagicLinkResendHandler } from "./magic-link-resend";

function createMockInviteRepository() {
  return {
    findById: vi.fn<
      (id: string) => Promise<{
        id: string;
        email: string;
        role: string;
        status: "pending" | "accepted" | "revoked";
        invitedByAdminId: string | null;
        expiresAt: Date;
      } | null>
    >(),
    accept: vi.fn<(id: string) => Promise<void>>(),
    resendInvite: vi.fn<
      (
        email: string,
        role: string,
        newExpiresAt: Date,
      ) => Promise<{
        id: string;
        email: string;
        role: string;
        status: "pending";
        invitedByAdminId: string | null;
        expiresAt: Date;
      }>
    >(),
  };
}

function createMockEmailDeliveryService() {
  return {
    sendEmail:
      vi.fn<
        (input: {
          recipient: string;
          type: string;
          payload: Record<string, unknown>;
        }) => Promise<{ emailEvent: unknown }>
      >(),
  };
}

function createMockMagicLinkTokenIssuer() {
  return createMagicLinkTokenIssuer({
    clock: () => new Date("2026-07-12T00:00:00.000Z"),
    baseUrl: "https://slotmerge.example.com",
    secret: "test-secret",
  });
}

function createMockTransaction(
  inviteRepo: ReturnType<typeof createMockInviteRepository>,
) {
  return vi.fn<
    (
      fn: (ctx: {
        inviteRepository: ReturnType<typeof createMockInviteRepository>;
      }) => Promise<void>,
    ) => Promise<void>
  >(async (fn) => {
    await fn({
      inviteRepository: inviteRepo,
    });
  });
}

describe("magic link resend handler", () => {
  describe("POST", () => {
    it("returns error for missing token", async () => {
      const mockInviteRepo = createMockInviteRepository();
      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: createMockEmailDeliveryService(),
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams(),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invalid_token");
    });

    it("returns error for invalid token", async () => {
      const mockInviteRepo = createMockInviteRepository();
      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: createMockEmailDeliveryService(),
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: "not-a-valid-token" }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invalid_token");
    });

    it("returns error for expired token (still allows resend — invite may be valid)", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-07-14T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.resendInvite.mockResolvedValue({
        id: "new-invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({ emailEvent: {} });

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-20T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: mockEmailService,
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Check your email");
    });

    it("returns error for invite not found", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "non-existent",
        email: "alice@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue(null);

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: createMockEmailDeliveryService(),
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_not_found");
    });

    it("returns error for already-accepted invite (non-retryable)", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "accepted",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: createMockEmailDeliveryService(),
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_already_accepted");
      expect(mockInviteRepo.resendInvite).not.toHaveBeenCalled();
    });

    it("returns error for revoked invite (non-retryable)", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "revoked",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: createMockEmailDeliveryService(),
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_revoked");
      expect(mockInviteRepo.resendInvite).not.toHaveBeenCalled();
    });

    it("returns error for expired invite record", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-07-10T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: createMockEmailDeliveryService(),
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_expired");
    });

    it("resends invite and sends email to invited email only", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-07-14T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "organizer",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      const newInvite = {
        id: "new-invite-1",
        email: "alice@example.com",
        role: "organizer",
        status: "pending" as const,
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      };
      mockInviteRepo.resendInvite.mockResolvedValue(newInvite);

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({ emailEvent: {} });

      const newIssuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: mockEmailService,
        magicLinkTokenIssuer: newIssuer,
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockInviteRepo.resendInvite).toHaveBeenCalledWith(
        "alice@example.com",
        "organizer",
        expect.any(Date),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(1);
      const emailCall = mockEmailService.sendEmail.mock.calls[0][0];
      expect(emailCall.recipient).toBe("alice@example.com");
      expect(emailCall.type).toBe("invite");
      expect(emailCall.payload.email).toBe("alice@example.com");
    });

    it("returns 200 confirmation page after successful resend", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-07-14T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.resendInvite.mockResolvedValue({
        id: "new-invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({ emailEvent: {} });

      const { POST } = createMagicLinkResendHandler({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        baseUrl: "https://slotmerge.example.com",
        inviteRepository: mockInviteRepo,
        emailDeliveryService: mockEmailService,
        magicLinkTokenIssuer: createMockMagicLinkTokenIssuer(),
        transaction: createMockTransaction(mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/resend", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Check your email");
      expect(html).toContain("alice@example.com");
    });
  });
});
