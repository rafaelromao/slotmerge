import { describe, expect, it, vi } from "vitest";

import { createMagicLinkVerifyHandlers } from "./magic-link-verify";
import { createMagicLinkTokenIssuer } from "./magic-link";

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
        magicLinkGeneration?: number;
      } | null>
    >(),
    accept: vi.fn<(id: string) => Promise<boolean>>(),
  };
}

function createMockUserRepository() {
  return {
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

function createMockSessionRepository() {
  return {
    create:
      vi.fn<
        (data: {
          userId: string;
          csrfToken: string;
          expiresAt: Date;
        }) => Promise<{ id: string }>
      >(),
    delete: vi.fn<(id: string) => Promise<void>>(),
  };
}

function createTransaction(
  sessionRepo: ReturnType<typeof createMockSessionRepository>,
  inviteRepo: ReturnType<typeof createMockInviteRepository>,
) {
  return vi.fn<
    (
      fn: (ctx: {
        sessionRepository: ReturnType<typeof createMockSessionRepository>;
        inviteRepository: ReturnType<typeof createMockInviteRepository>;
      }) => Promise<void>,
    ) => Promise<void>
  >(async (fn) => {
    await fn({
      sessionRepository: sessionRepo,
      inviteRepository: inviteRepo,
    });
  });
}

describe("magic link verify handler - T3 contract", () => {
  describe("303 redirect on success", () => {
    it("returns 303 See Other to / on success, not 302", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.accept.mockResolvedValue(true);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "user",
        status: "active",
      });

      const mockSessionRepo = createMockSessionRepository();
      mockSessionRepo.create.mockResolvedValue({ id: "session-1" });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        sessionRepository: mockSessionRepo,
        transaction: createTransaction(mockSessionRepo, mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toMatch(
        /^http:\/\/localhost(?::3000)?\/$/,
      );
      expect(response.headers.get("Set-Cookie")).toContain(
        "slotmerge_session=",
      );
    });
  });

  describe("three-state error mapping", () => {
    it("maps token_expired to link_expired label", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-07-14T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-20T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_expired");
      expect(html).toContain("token_expired");
      expect(html).toContain("Request a new link");
      expect(html).toContain('href="/sign-in?email=alice%40example.com"');
    });

    it("maps invite_expired to link_expired label", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_expired");
      expect(html).toContain("invite_expired");
    });

    it("maps invite_already_accepted to link_used label", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_used");
      expect(html).toContain("invite_already_accepted");
    });

    it("maps invalid_token to link_invalid label", async () => {
      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: "totally-malformed-token" }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_invalid");
      expect(html).toContain("invalid_token");
    });

    it("maps email_mismatch to link_invalid label", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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
        email: "bob@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_invalid");
      expect(html).toContain("email_mismatch");
    });

    it("maps invite_revoked to link_invalid label", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_invalid");
      expect(html).toContain("invite_revoked");
    });

    it("maps not_invited to link_invalid label", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "non-existent-invite",
        email: "alice@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockInviteRepo = createMockInviteRepository();
      mockInviteRepo.findById.mockResolvedValue(null);

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("link_invalid");
      expect(html).toContain("not_invited");
    });
  });

  describe("Request a new link path", () => {
    it("includes a Request a new link link to /sign-in?email= on all error states", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: "test-secret",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: "invite-1",
        email: "alice@example.com",
        expiresAt: new Date("2026-07-14T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-20T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("Request a new link");
      expect(html).toContain('href="/sign-in?email=alice%40example.com"');
    });

    it("falls back to plain /sign-in when no email is known", async () => {
      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: "totally-malformed" }),
        }),
      );

      const html = await response.text();
      expect(html).toContain("Request a new link");
      expect(html).toContain('href="/sign-in"');
    });
  });

  describe("single-use atomicity (session insert failure rolls back invite accept)", () => {
    it("rejects the verify with link_used when accept returns false (race or already accepted)", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.accept.mockResolvedValue(false);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "user",
        status: "active",
      });

      const mockSessionRepo = createMockSessionRepository();
      mockSessionRepo.create.mockResolvedValue({ id: "session-1" });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        sessionRepository: mockSessionRepo,
        transaction: createTransaction(mockSessionRepo, mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("link_used");
      expect(html).toContain("invite_already_accepted");
    });

    it("does NOT accept the invite when session insert fails", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
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
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockUserRepo.create.mockResolvedValue({
        id: "user-1",
        email: "alice@example.com",
        role: "user",
        status: "active",
      });

      const mockSessionRepo = createMockSessionRepository();
      mockSessionRepo.create.mockRejectedValue(
        new Error("session insert boom"),
      );

      const { POST } = createMagicLinkVerifyHandlers({
        clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        sessionRepository: mockSessionRepo,
        transaction: createTransaction(mockSessionRepo, mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(500);
      expect(mockInviteRepo.accept).not.toHaveBeenCalled();
    });
  });
});
