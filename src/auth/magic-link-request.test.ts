import { describe, expect, it, vi } from "vitest";

import { createMagicLinkRequestHandlers } from "./magic-link-request";
import { createMagicLinkTokenIssuer } from "./magic-link";
import type { EmailType } from "../email/service";

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
    findPendingByEmail: vi.fn<
      (email: string) => Promise<{
        id: string;
        email: string;
        role: string;
        status: "pending" | "accepted" | "revoked";
        invitedByAdminId: string | null;
        expiresAt: Date;
      } | null>
    >(),
    accept: vi.fn<(id: string) => Promise<void>>(),
  };
}

function createMockUserRepository() {
  return {
    findById: vi.fn<
      (id: string) => Promise<{
        id: string;
        email: string;
        role: string;
        status: string;
      } | null>
    >(),
    findByEmail: vi.fn<
      (email: string) => Promise<{
        id: string;
        email: string;
        role: string;
        status: string;
      } | null>
    >(),
    create: vi.fn<
      (data: { email: string; role: string }) => Promise<{
        id: string;
        email: string;
        role: string;
        status: string;
      }>
    >(),
  };
}

function createMockEmailDeliveryService() {
  return {
    sendEmail: vi.fn<
      (input: {
        recipient: string;
        type: "magic-link";
        payload: Record<string, unknown>;
      }) => Promise<{
        emailEvent: {
          id: string;
          recipient: string;
          type: EmailType;
          payloadReference: string;
          status: "queued" | "sending" | "sent" | "failed";
          attempts: number;
          createdAt: Date;
          updatedAt: Date;
          sentAt: Date | null;
          failedAt: Date | null;
          lastAttemptAt: Date | null;
          lastErrorCode: string | null;
          lastErrorMessage: string | null;
        };
      }>
    >(),
  };
}

describe("magic link request handler", () => {
  describe("POST", () => {
    it("returns 202 for unknown email (no pending invite, no user) — non-leaking", async () => {
      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue(null);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const { POST } = createMagicLinkRequestHandlers({
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
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });
    });

    it("returns 202 for email with only accepted invite (no user) — non-leaking", async () => {
      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue(null);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "accepted@example.com" }),
        }),
      );

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });
    });

    it("returns 202 for suspended user — non-leaking", async () => {
      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue(null);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "user-1",
        email: "suspended@example.com",
        role: "user",
        status: "suspended",
      });

      const { POST } = createMagicLinkRequestHandlers({
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
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });
    });

    it("returns 202 for suspended user even with pending invite (no email sent, non-leaking)", async () => {
      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue({
        id: "invite-1",
        email: "suspended@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "user-1",
        email: "suspended@example.com",
        role: "user",
        status: "suspended",
      });

      const { POST } = createMagicLinkRequestHandlers({
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
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });
      expect(mockInviteRepo.findPendingByEmail).not.toHaveBeenCalled();
    });

    it("rate limits repeated request attempts from the same client (5 OK then 429)", async () => {
      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue(null);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
      });

      const request = () =>
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "unknown@example.com" }),
        });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await POST(request());
        expect(response.status).toBe(202);
      }

      const response = await POST(request());
      expect(response.status).toBe(429);
      const body = (await response.json()) as { error?: string };
      expect(body).toEqual({ error: "rate_limited" });
    });

    it("returns invalid_email for missing email", async () => {
      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams(),
        }),
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ error: "invalid_email" });
    });

    it("returns invalid_email for empty email", async () => {
      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "   " }),
        }),
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ error: "invalid_email" });
    });

    it("issues magic link and sends email for pending invite", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({
        emailEvent: {
          id: "event-1",
          recipient: "",
          type: "magic-link",
          payloadReference: "",
          status: "sent",
          attempts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: new Date(),
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        magicLinkTokenIssuer: issuer,
        emailDeliveryService: mockEmailService,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "alice@example.com" }),
        }),
      );

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });

      expect(mockInviteRepo.findPendingByEmail).toHaveBeenCalledWith(
        "alice@example.com",
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "alice@example.com",
          type: "magic-link",
        }),
      );
    });

    it("issues magic link and sends email for existing active user", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue(null);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "user-1",
        email: "existing@example.com",
        role: "user",
        status: "active",
      });

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({
        emailEvent: {
          id: "event-1",
          recipient: "",
          type: "magic-link",
          payloadReference: "",
          status: "sent",
          attempts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: new Date(),
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        magicLinkTokenIssuer: issuer,
        emailDeliveryService: mockEmailService,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "existing@example.com" }),
        }),
      );

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith(
        "existing@example.com",
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "existing@example.com",
          type: "magic-link",
        }),
      );
    });

    it("sends magic link to existing user even when pending invite also exists for same email", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue({
        id: "invite-1",
        email: "both@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "user-1",
        email: "both@example.com",
        role: "user",
        status: "active",
      });

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({
        emailEvent: {
          id: "event-1",
          recipient: "",
          type: "magic-link",
          payloadReference: "",
          status: "sent",
          attempts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: new Date(),
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        magicLinkTokenIssuer: issuer,
        emailDeliveryService: mockEmailService,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "both@example.com" }),
        }),
      );

      expect(response.status).toBe(202);
      const body = (await response.json()) as {
        error?: string;
        sent?: boolean;
      };
      expect(body).toEqual({ sent: true });

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith("both@example.com");
      expect(mockInviteRepo.findPendingByEmail).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "both@example.com",
          type: "magic-link",
        }),
      );
    });

    it("normalizes email to lowercase before lookup", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue({
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockUserRepo = createMockUserRepository();

      const mockEmailService = createMockEmailDeliveryService();
      mockEmailService.sendEmail.mockResolvedValue({
        emailEvent: {
          id: "event-1",
          recipient: "",
          type: "magic-link",
          payloadReference: "",
          status: "sent",
          attempts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: new Date(),
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        magicLinkTokenIssuer: issuer,
        emailDeliveryService: mockEmailService,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "Alice@EXAMPLE.COM" }),
        }),
      );

      expect(response.status).toBe(202);
      expect(mockInviteRepo.findPendingByEmail).toHaveBeenCalledWith(
        "alice@example.com",
      );
    });

    it("returns indistinguishable 202 responses for unknown and uninvited emails", async () => {
      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findPendingByEmail.mockResolvedValue(null);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const { POST } = createMagicLinkRequestHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
      });

      const unknownResponse = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "unknown@example.com" }),
        }),
      );

      const knownButNotInvitedResponse = await POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          body: new URLSearchParams({ email: "notinvited@example.com" }),
        }),
      );

      expect(unknownResponse.status).toBe(202);
      expect(knownButNotInvitedResponse.status).toBe(202);

      const unknownBody = (await unknownResponse.json()) as { sent?: boolean };
      const knownBody = (await knownButNotInvitedResponse.json()) as {
        sent?: boolean;
      };
      expect(unknownBody).toEqual(knownBody);
      expect(unknownBody).toEqual({ sent: true });
    });
  });
});
