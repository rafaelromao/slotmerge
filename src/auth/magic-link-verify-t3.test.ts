import { describe, expect, it, vi } from "vitest";

import { createMagicLinkVerifyHandlers } from "./magic-link-verify";
import { createMagicLinkTokenIssuer } from "./magic-link";

function expectErrorRedirect(
  response: Response,
  state: string,
  reason: string,
  email?: string,
): URL {
  expect(response.status).toBe(303);
  const location = response.headers.get("Location");
  expect(location).not.toBeNull();
  const url = new URL(location!);
  expect(url.pathname).toBe("/sign-in/verify");
  expect(url.searchParams.get("error")).toBe(state);
  expect(url.searchParams.get("reason")).toBe(reason);
  expect(url.searchParams.get("email")).toBe(email ?? null);
  return url;
}

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
    findById: vi.fn<
      (id: string) => Promise<{
        id: string;
        email: string;
        role: string;
        status: string;
        magicLinkGeneration?: number;
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
    claimMagicLink: vi.fn<
      (input: {
        id: string;
        email: string;
        generation: number;
        now: Date;
      }) => Promise<{
        id: string;
        email: string;
        role: string;
        status: string;
        magicLinkGeneration?: number;
      } | null>
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
  userRepo?: ReturnType<typeof createMockUserRepository>,
) {
  return vi.fn<
    (
      fn: (ctx: {
        sessionRepository: ReturnType<typeof createMockSessionRepository>;
        inviteRepository: ReturnType<typeof createMockInviteRepository>;
        userRepository?: ReturnType<typeof createMockUserRepository>;
      }) => Promise<void>,
    ) => Promise<void>
  >(async (fn) => {
    await fn({
      sessionRepository: sessionRepo,
      inviteRepository: inviteRepo,
      userRepository: userRepo,
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

      const url = expectErrorRedirect(
        response,
        "link_expired",
        "token_expired",
        "alice@example.com",
      );
      expect(url.searchParams.get("token")).toBe(token.token);
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

      expectErrorRedirect(
        response,
        "link_expired",
        "invite_expired",
        "alice@example.com",
      );
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

      expectErrorRedirect(
        response,
        "link_used",
        "invite_already_accepted",
        "alice@example.com",
      );
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

      expectErrorRedirect(response, "link_invalid", "invalid_token");
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

      expectErrorRedirect(
        response,
        "link_invalid",
        "email_mismatch",
        "alice@example.com",
      );
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

      expectErrorRedirect(
        response,
        "link_invalid",
        "invite_revoked",
        "alice@example.com",
      );
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

      expectErrorRedirect(
        response,
        "link_invalid",
        "not_invited",
        "alice@example.com",
      );
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

      expectErrorRedirect(
        response,
        "link_expired",
        "token_expired",
        "alice@example.com",
      );
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

      expectErrorRedirect(response, "link_invalid", "invalid_token");
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

      expectErrorRedirect(
        response,
        "link_used",
        "invite_already_accepted",
        "alice@example.com",
      );
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

      expectErrorRedirect(response, "link_invalid", "server_error");
      expect(mockInviteRepo.accept).not.toHaveBeenCalled();
    });
  });

  it("creates a session for an active existing User token and rejects replay", async () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "test-secret",
    });
    const token = issuer.issueMagicLinkToken({
      userId: "user-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      generation: 1,
    });
    const inviteRepo = createMockInviteRepository();
    const userRepo = createMockUserRepository();
    const activeUser = {
      id: "user-1",
      email: "alice@example.com",
      role: "user",
      status: "active",
      magicLinkGeneration: 2,
    };
    userRepo.claimMagicLink
      .mockResolvedValueOnce(activeUser)
      .mockResolvedValueOnce(null);
    userRepo.findById.mockResolvedValue(activeUser);
    const sessionRepo = createMockSessionRepository();
    sessionRepo.create.mockResolvedValue({ id: "session-1" });
    const { POST } = createMagicLinkVerifyHandlers({
      clock: { now: () => now },
      magicLinkSecret: "test-secret",
      inviteRepository: inviteRepo,
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      transaction: createTransaction(sessionRepo, inviteRepo, userRepo),
    });
    const request = () =>
      new Request("http://localhost/auth/magic-link/verify", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      });

    const success = await POST(request());
    const replay = await POST(request());

    expect(success.status).toBe(303);
    expect(success.headers.get("Location")).toMatch(/\/$/);
    expectErrorRedirect(
      replay,
      "link_used",
      "magic_link_already_used",
      "alice@example.com",
    );
    expect(userRepo.claimMagicLink).toHaveBeenCalledWith({
      id: "user-1",
      email: "alice@example.com",
      generation: 1,
      now,
    });
    expect(sessionRepo.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an invite token when a concurrent resend changes its generation", async () => {
    const issuer = createMagicLinkTokenIssuer({
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      baseUrl: "https://slotmerge.example.com",
      secret: "test-secret",
    });
    const token = issuer.issueMagicLinkToken({
      inviteId: "invite-1",
      email: "alice@example.com",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      generation: 0,
    });
    const staleInvite = {
      id: "invite-1",
      email: "alice@example.com",
      role: "user",
      status: "pending" as const,
      invitedByAdminId: "admin-1",
      expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      magicLinkGeneration: 1,
    };
    const inviteRepo = {
      ...createMockInviteRepository(),
      claim: vi.fn().mockResolvedValue(null),
    };
    inviteRepo.findById.mockResolvedValue(staleInvite);
    const userRepo = createMockUserRepository();
    const sessionRepo = createMockSessionRepository();
    const { POST } = createMagicLinkVerifyHandlers({
      clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
      magicLinkSecret: "test-secret",
      inviteRepository: inviteRepo,
      userRepository: userRepo,
      sessionRepository: sessionRepo,
      transaction: createTransaction(sessionRepo, inviteRepo, userRepo),
    });

    const response = await POST(
      new Request("http://localhost/auth/magic-link/verify", {
        method: "POST",
        body: new URLSearchParams({ token: token.token }),
      }),
    );

    expectErrorRedirect(
      response,
      "link_invalid",
      "invalid_token",
      "alice@example.com",
    );
    expect(sessionRepo.create).not.toHaveBeenCalled();
  });
});
