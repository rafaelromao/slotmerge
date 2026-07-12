import { describe, expect, it, vi } from "vitest";

import { createMagicLinkVerifyHandlers } from "./magic-link-verify";
import { createMagicLinkTokenIssuer } from "./magic-link";

const SESSION_LIFETIME_DAYS = 30;

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
    const createdSessions: string[] = [];
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
    const origCreate = sessionRepo.create;
    sessionRepo.create = (async (data) => {
      const result = await (origCreate as any)(data);
      createdSessions.push((result as any)["id"]);
      return result as any;
    }) as typeof sessionRepo.create;
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */

    try {
      await fn({
        sessionRepository: sessionRepo,
        inviteRepository: inviteRepo,
      });
    } catch (err) {
      for (const id of createdSessions) {
        await sessionRepo.delete(id);
      }
      throw err;
    } finally {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
      sessionRepo.create = origCreate as typeof sessionRepo.create;
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
    }
  });
}

describe("magic link verify handler", () => {
  describe("POST", () => {
    it("returns error for missing token", async () => {
      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams(),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invalid_token");
    });

    it("returns error for invalid token", async () => {
      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: "invalid-token" }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invalid_token");
    });

    it("returns error for expired token", async () => {
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

      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-20T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("token_expired");
    });

    it("returns error for non-existent invite", async () => {
      const issuer = createMagicLinkTokenIssuer({
        clock: () => new Date("2026-07-12T00:00:00.000Z"),
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
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_not_found");
    });

    it("returns error for already-accepted invite", async () => {
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

      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_already_accepted");
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

      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("invite_expired");
    });

    it("returns error for email mismatch", async () => {
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
        email: "bob@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: null,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain("email_mismatch");
    });

    it("creates user, session, accepts invite, and redirects on valid token", async () => {
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
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.accept.mockResolvedValue(undefined);

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
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        sessionRepository: mockSessionRepo,
        sessionLifetimeDays: SESSION_LIFETIME_DAYS,
        transaction: createTransaction(mockSessionRepo, mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("http://localhost/");
      expect(response.headers.get("Set-Cookie")).toContain(
        "slotmerge_session=",
      );

      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith(
        "alice@example.com",
      );
      expect(mockUserRepo.create).toHaveBeenCalledWith({
        email: "alice@example.com",
        role: "user",
      });
      expect(mockSessionRepo.create).toHaveBeenCalled();
      expect(mockInviteRepo.accept).toHaveBeenCalledWith("invite-1");
    });

    it("rolls back session if invite.accept fails", async () => {
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
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.accept.mockRejectedValue(new Error("DB write failure"));

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
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        sessionRepository: mockSessionRepo,
        sessionLifetimeDays: SESSION_LIFETIME_DAYS,
        transaction: createTransaction(mockSessionRepo, mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(500);
      expect(mockSessionRepo.create).toHaveBeenCalled();
      expect(mockInviteRepo.accept).toHaveBeenCalledWith("invite-1");
      expect(mockSessionRepo.delete).toHaveBeenCalledWith("session-1");
    });

    it("reuses existing user without creating new one", async () => {
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
        role: "organizer",
        status: "pending",
        invitedByAdminId: "admin-1",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });
      mockInviteRepo.accept.mockResolvedValue(undefined);

      const mockUserRepo = createMockUserRepository();
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "existing-user-1",
        email: "alice@example.com",
        role: "user",
        status: "active",
      });

      const mockSessionRepo = createMockSessionRepository();
      mockSessionRepo.create.mockResolvedValue({ id: "session-1" });

      const { POST } = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
        inviteRepository: mockInviteRepo,
        userRepository: mockUserRepo,
        sessionRepository: mockSessionRepo,
        sessionLifetimeDays: SESSION_LIFETIME_DAYS,
        transaction: createTransaction(mockSessionRepo, mockInviteRepo),
      });

      const response = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          body: new URLSearchParams({ token: token.token }),
        }),
      );

      expect(response.status).toBe(302);
      expect(mockUserRepo.create).not.toHaveBeenCalled();
      expect(mockUserRepo.findByEmail).toHaveBeenCalledWith(
        "alice@example.com",
      );
    });
  });

  describe("GET", () => {
    it("renders an auto-submit form", async () => {
      const handlers = createMagicLinkVerifyHandlers({
        clock: () => new Date("2026-07-15T00:00:00.000Z"),
        magicLinkSecret: "test-secret",
      });

      const url = new URL("http://localhost/auth/magic-link/verify");
      url.searchParams.set("token", "test-token");

      const response = handlers.GET(new Request(url));

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("<form");
      expect(html).toContain('method="POST"');
      expect(html).toContain('name="token"');
      expect(html).toContain("test-token");
      expect(html).toContain("Click here if not redirected automatically");
    });
  });
});
