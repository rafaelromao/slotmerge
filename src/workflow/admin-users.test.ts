import { describe, expect, it, vi } from "vitest";

import { createAdminUsersWorkflow } from "./admin-users";
import type {
  AdminUserRepository,
  UserListItem,
} from "../admin/users.repository";
import type { InviteRepository } from "../admin/invites.repository";
import type { SessionRepository } from "../auth/session";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? ReturnType<typeof vi.fn>
    : T[K];
};

function buildUserRepository(
  overrides: DeepPartial<AdminUserRepository> = {},
): AdminUserRepository {
  return {
    listUsers: vi.fn().mockResolvedValue([]),
    findActiveUserByEmail: vi.fn().mockResolvedValue(null),
    changeRole: vi.fn(),
    suspend: vi.fn(),
    reinstate: vi.fn(),
    ...overrides,
  } as AdminUserRepository;
}

function buildInviteRepository(
  overrides: DeepPartial<InviteRepository> = {},
): InviteRepository {
  return {
    listInvites: vi.fn().mockResolvedValue([]),
    listRecentInvites: vi.fn().mockResolvedValue([]),
    createInvite: vi.fn(),
    findInviteById: vi.fn(),
    findPendingInviteByEmail: vi.fn().mockResolvedValue(null),
    refreshInvite: vi.fn(),
    ...overrides,
  } as InviteRepository;
}

function buildSessionRepository(
  overrides: DeepPartial<Pick<SessionRepository, "deleteByUserId">> = {},
): Pick<SessionRepository, "deleteByUserId"> {
  return {
    deleteByUserId: vi.fn(),
    ...overrides,
  };
}

const fixedClock = { now: () => new Date("2026-07-12T12:00:00.000Z") };

function buildUsersListFixture(): UserListItem[] {
  return [
    {
      id: "u-target",
      email: "target@example.com",
      displayName: "Target",
      role: "user",
      status: "active",
    },
  ];
}

function expectOk<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  expect(result.ok).toBe(true);
  return (result as { ok: true; value: T }).value;
}

function expectErr<E>(
  result: { ok: true; value: unknown } | { ok: false; error: E },
): E {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
}

describe("adminUsersWorkflow", () => {
  describe("load", () => {
    it("returns the user list ordered by the repository result", async () => {
      const userRows: UserListItem[] = [
        {
          id: "u-1",
          email: "ada@example.com",
          displayName: "Ada",
          role: "user",
          status: "active",
        },
        {
          id: "u-2",
          email: "bob@example.com",
          displayName: null,
          role: "organizer",
          status: "suspended",
        },
      ];

      const userRepository = buildUserRepository({
        listUsers: vi.fn().mockResolvedValue(userRows),
      });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.load();

      const value = expectOk(result);
      expect(value.users).toEqual(userRows);
    });

    it("returns an empty recentInvites list when the repository has no invites", async () => {
      const userRepository = buildUserRepository({
        listUsers: vi.fn().mockResolvedValue([]),
      });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.load();

      const value = expectOk(result);
      expect(value.recentInvites).toEqual([]);
    });

    it("derives the expired status when a pending invite has passed its expiry", async () => {
      const inviteRows = [
        {
          id: "invite-fresh",
          email: "fresh@example.com",
          role: "user" as const,
          status: "pending" as const,
          invitedByAdminId: "admin-1",
          invitedByAdminEmail: "admin@example.com",
          expiresAt: new Date("2026-07-19T12:00:00.000Z"),
          magicLinkGeneration: 0,
        },
        {
          id: "invite-stale",
          email: "stale@example.com",
          role: "user" as const,
          status: "pending" as const,
          invitedByAdminId: "admin-1",
          invitedByAdminEmail: "admin@example.com",
          expiresAt: new Date("2026-06-01T12:00:00.000Z"),
          magicLinkGeneration: 0,
        },
        {
          id: "invite-accepted",
          email: "accepted@example.com",
          role: "user" as const,
          status: "accepted" as const,
          invitedByAdminId: "admin-1",
          invitedByAdminEmail: "admin@example.com",
          expiresAt: new Date("2026-08-01T12:00:00.000Z"),
          magicLinkGeneration: 0,
        },
      ];

      const userRepository = buildUserRepository({
        listUsers: vi.fn().mockResolvedValue([]),
      });
      const inviteRepository = buildInviteRepository({
        listRecentInvites: vi.fn().mockResolvedValue(inviteRows),
      });
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.load();

      const value = expectOk(result);
      const fresh = value.recentInvites.find((i) => i.id === "invite-fresh");
      const stale = value.recentInvites.find((i) => i.id === "invite-stale");
      const accepted = value.recentInvites.find(
        (i) => i.id === "invite-accepted",
      );
      expect(fresh?.effectiveStatus).toBe("pending");
      expect(stale?.effectiveStatus).toBe("expired");
      expect(accepted?.effectiveStatus).toBe("accepted");
    });
  });

  describe("inviteUser", () => {
    const actor = {
      actorId: "admin-1",
      actorEmail: "admin@example.com",
    };

    it("returns self_invite when the actor targets their own email", async () => {
      const userRepository = buildUserRepository();
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();
      const emailDeliveryService = {
        sendEmail: vi.fn(),
      };

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        emailDeliveryService,
        magicLinkTokenIssuer: {
          issueMagicLinkToken: vi.fn(),
        },
        clock: fixedClock,
      });

      const result = await workflow.inviteUser({
        ...actor,
        email: "ADMIN@example.com",
        role: "user",
      });

      expect(expectErr(result)).toBe("self_invite");
      expect(emailDeliveryService.sendEmail).not.toHaveBeenCalled();
    });

    it("returns invalid_email for blank input", async () => {
      const userRepository = buildUserRepository();
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.inviteUser({
        ...actor,
        email: "   ",
        role: "user",
      });

      expect(expectErr(result)).toBe("invalid_email");
    });

    it("returns email_already_invited when an active user with the same email exists", async () => {
      const userRepository = buildUserRepository({
        findActiveUserByEmail: vi.fn().mockResolvedValue({
          id: "u-1",
          email: "newperson@example.com",
          displayName: null,
          role: "user",
          status: "active",
        }),
      });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();
      const emailDeliveryService = {
        sendEmail: vi.fn(),
      };

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        emailDeliveryService,
        magicLinkTokenIssuer: {
          issueMagicLinkToken: vi.fn(),
        },
        clock: fixedClock,
      });

      const result = await workflow.inviteUser({
        ...actor,
        email: "newperson@example.com",
        role: "user",
      });

      expect(expectErr(result)).toBe("email_already_invited");
      expect(emailDeliveryService.sendEmail).not.toHaveBeenCalled();
    });

    it("returns email_already_invited when a pending invite with the same email exists", async () => {
      const userRepository = buildUserRepository({
        findActiveUserByEmail: vi.fn().mockResolvedValue(null),
      });
      const inviteRepository = buildInviteRepository({
        findPendingInviteByEmail: vi.fn().mockResolvedValue({
          id: "invite-existing",
          email: "newperson@example.com",
          role: "user",
          status: "pending",
          invitedByAdminId: "admin-2",
          invitedByAdminEmail: "admin2@example.com",
        }),
      });
      const sessionRepository = buildSessionRepository();
      const emailDeliveryService = {
        sendEmail: vi.fn(),
      };

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        emailDeliveryService,
        magicLinkTokenIssuer: {
          issueMagicLinkToken: vi.fn(),
        },
        clock: fixedClock,
      });

      const result = await workflow.inviteUser({
        ...actor,
        email: "newperson@example.com",
        role: "user",
      });

      expect(expectErr(result)).toBe("email_already_invited");
      expect(emailDeliveryService.sendEmail).not.toHaveBeenCalled();
    });

    it("creates a pending invite and enqueues an invite email on success", async () => {
      const userRepository = buildUserRepository({
        findActiveUserByEmail: vi.fn().mockResolvedValue(null),
      });
      const createInvite = vi.fn().mockResolvedValue({
        ok: true,
        invite: {
          id: "invite-1",
          email: "newperson@example.com",
          role: "user",
          status: "pending",
          invitedByAdminId: "admin-1",
          invitedByAdminEmail: "admin@example.com",
          expiresAt: new Date("2026-08-11T12:00:00.000Z"),
          magicLinkGeneration: 0,
        },
      });
      const inviteRepository = buildInviteRepository({
        findPendingInviteByEmail: vi.fn().mockResolvedValue(null),
        createInvite,
      });
      const sessionRepository = buildSessionRepository();
      const issueMagicLinkToken = vi.fn().mockReturnValue({
        token: "magic-token-1",
        magicLinkUrl:
          "http://localhost/auth/magic-link/verify?token=magic-token-1",
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
      });
      const emailDeliveryService = {
        sendEmail: vi.fn().mockResolvedValue({ emailEvent: { id: "evt-1" } }),
      };

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        emailDeliveryService,
        magicLinkTokenIssuer: { issueMagicLinkToken },
        clock: fixedClock,
      });

      const result = await workflow.inviteUser({
        ...actor,
        email: "  newperson@example.com  ",
        role: "organizer",
      });

      const value = expectOk(result);
      expect(value).toEqual({
        maskedEmail: "ne***@example.com",
        inviteId: "invite-1",
      });
      const createCall = createInvite.mock.calls[0]?.[0] as {
        email: string;
        role: string;
        invitedByAdminId: string;
        now: Date;
        expiresAt: Date;
      };
      expect(createCall.email).toBe("newperson@example.com");
      expect(createCall.role).toBe("organizer");
      expect(createCall.invitedByAdminId).toBe("admin-1");
      expect(createCall.now).toEqual(fixedClock.now());
      expect(createCall.expiresAt).toBeInstanceOf(Date);
      const emailCall = emailDeliveryService.sendEmail.mock.calls[0]?.[0] as {
        recipient: string;
        type: string;
        payload: Record<string, unknown>;
      };
      expect(emailCall.recipient).toBe("newperson@example.com");
      expect(emailCall.type).toBe("invite");
      expect(emailCall.payload.inviteId).toBe("invite-1");
      expect(emailCall.payload.email).toBe("newperson@example.com");
      expect(emailCall.payload.invitedByAdminId).toBe("admin-1");
      expect(emailCall.payload.magicLinkUrl).toBe(
        "http://localhost/auth/magic-link/verify?token=magic-token-1",
      );
      expect(emailCall.payload.magicLinkToken).toBe("magic-token-1");
    });
  });

  describe("resendInvite", () => {
    const now = new Date("2026-07-12T12:00:00.000Z");
    const fixedClock = { now: () => now };

    it("returns invite_not_found when the original invite is missing", async () => {
      const userRepository = buildUserRepository();
      const findInviteById = vi.fn().mockResolvedValue(null);
      const refreshInvite = vi.fn();
      const inviteRepository = buildInviteRepository({
        findInviteById,
        refreshInvite,
      });
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.resendInvite({
        actorId: "admin-1",
        inviteId: "invite-missing",
      });

      expect(expectErr(result)).toBe("invite_not_found");
      expect(refreshInvite).not.toHaveBeenCalled();
    });

    it("refreshes the existing invite in place — no insert call", async () => {
      const userRepository = buildUserRepository();
      const findInviteById = vi.fn().mockResolvedValue({
        id: "invite-1",
        email: "stale@example.com",
        role: "user" as const,
        status: "revoked" as const,
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        magicLinkGeneration: 1,
        expiresAt: new Date("2026-07-01T12:00:00.000Z"),
      });
      const createInvite = vi.fn();
      const revokeInvite = vi.fn();
      const refreshInvite = vi.fn().mockResolvedValue({
        ok: true,
        invite: {
          id: "invite-1",
          email: "stale@example.com",
          role: "user" as const,
          status: "pending" as const,
          invitedByAdminId: "admin-1",
          invitedByAdminEmail: "admin@example.com",
          expiresAt: new Date("2026-08-11T12:00:00.000Z"),
          magicLinkGeneration: 2,
        },
      });
      const inviteRepository = buildInviteRepository({
        findInviteById,
        refreshInvite,
        createInvite,
        revokeInvite,
      });
      const sessionRepository = buildSessionRepository();
      const issueMagicLinkToken = vi.fn().mockReturnValue({
        token: "magic-token-2",
        magicLinkUrl:
          "http://localhost/auth/magic-link/verify?token=magic-token-2",
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
      });
      const emailDeliveryService = {
        sendEmail: vi.fn().mockResolvedValue({ emailEvent: { id: "evt-2" } }),
      };

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        emailDeliveryService,
        magicLinkTokenIssuer: { issueMagicLinkToken },
        clock: fixedClock,
      });

      const result = await workflow.resendInvite({
        actorId: "admin-1",
        inviteId: "invite-1",
      });

      const value = expectOk(result);
      expect(value).toEqual({
        maskedEmail: "st***@example.com",
        inviteId: "invite-1",
      });
      // The bug fix: must NOT call createInvite or revokeInvite — these corrupt status
      expect(createInvite).not.toHaveBeenCalled();
      expect(revokeInvite).not.toHaveBeenCalled();
      expect(refreshInvite).toHaveBeenCalledWith({
        inviteId: "invite-1",
        now,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
      });
      expect(emailDeliveryService.sendEmail).toHaveBeenCalled();
      const emailPayload = (
        emailDeliveryService.sendEmail.mock.calls[0]?.[0] as {
          payload: Record<string, unknown>;
        }
      ).payload;
      expect(emailPayload.previousInviteId).toBe("invite-1");
      expect(emailPayload.magicLinkGeneration).toBe(2);
    });

    it("returns user_already_active when the repository rejects the refresh", async () => {
      const userRepository = buildUserRepository();
      const findInviteById = vi.fn().mockResolvedValue({
        id: "invite-1",
        email: "stale@example.com",
        role: "user" as const,
        status: "revoked" as const,
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        magicLinkGeneration: 0,
        expiresAt: new Date("2026-07-01T12:00:00.000Z"),
      });
      const refreshInvite = vi.fn().mockResolvedValue({
        ok: false,
        reason: "user_already_active" as const,
      });
      const inviteRepository = buildInviteRepository({
        findInviteById,
        refreshInvite,
      });
      const sessionRepository = buildSessionRepository();
      const emailDeliveryService = {
        sendEmail: vi.fn(),
      };

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        emailDeliveryService,
        magicLinkTokenIssuer: { issueMagicLinkToken: vi.fn() },
        clock: fixedClock,
      });

      const result = await workflow.resendInvite({
        actorId: "admin-1",
        inviteId: "invite-1",
      });

      expect(expectErr(result)).toBe("user_already_active");
      expect(emailDeliveryService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("changeRole", () => {
    it("returns self_role_change when the actor targets themselves", async () => {
      const changeRole = vi.fn();
      const userRepository = buildUserRepository({ changeRole });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.changeRole({
        actorId: "admin-1",
        targetUserId: "admin-1",
        role: "user",
      });

      expect(expectErr(result)).toBe("self_role_change");
      expect(changeRole).not.toHaveBeenCalled();
    });

    it("returns user_not_found when the repository reports not_found", async () => {
      const listUsers = vi.fn().mockResolvedValue([
        {
          id: "u-2",
          email: "target@example.com",
          displayName: null,
          role: "user",
          status: "active",
        },
      ]);
      const changeRole = vi.fn().mockResolvedValue({
        ok: false,
        reason: "not_found",
      });
      const userRepository = buildUserRepository({ listUsers, changeRole });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.changeRole({
        actorId: "admin-1",
        targetUserId: "u-missing",
        role: "organizer",
      });

      expect(expectErr(result)).toBe("user_not_found");
      expect(changeRole).toHaveBeenCalledWith({
        userId: "u-missing",
        actingAdminId: "admin-1",
        role: "organizer",
        now: fixedClock.now(),
      });
    });

    it("returns ok when the repository succeeds", async () => {
      const listUsers = vi.fn().mockResolvedValue(buildUsersListFixture());
      const changeRole = vi.fn().mockResolvedValue({ ok: true });
      const userRepository = buildUserRepository({ listUsers, changeRole });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.changeRole({
        actorId: "admin-1",
        targetUserId: "u-target",
        role: "organizer",
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("suspend", () => {
    it("returns self_suspend when the actor targets themselves", async () => {
      const listUsers = vi.fn().mockResolvedValue([]);
      const suspend = vi.fn();
      const userRepository = buildUserRepository({ listUsers, suspend });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.suspend({
        actorId: "admin-1",
        targetUserId: "admin-1",
        confirmEmail: "admin@example.com",
      });

      expect(expectErr(result)).toBe("self_suspend");
      expect(suspend).not.toHaveBeenCalled();
    });

    it("returns confirm_email_required when the typed confirmation is missing", async () => {
      const listUsers = vi.fn().mockResolvedValue(buildUsersListFixture());
      const suspend = vi.fn();
      const userRepository = buildUserRepository({ listUsers, suspend });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.suspend({
        actorId: "admin-1",
        targetUserId: "u-target",
        confirmEmail: null,
      });

      expect(expectErr(result)).toBe("confirm_email_required");
      expect(suspend).not.toHaveBeenCalled();
    });

    it("returns confirm_email_mismatch when the typed confirmation does not match", async () => {
      const listUsers = vi.fn().mockResolvedValue(buildUsersListFixture());
      const suspend = vi.fn();
      const userRepository = buildUserRepository({ listUsers, suspend });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.suspend({
        actorId: "admin-1",
        targetUserId: "u-target",
        confirmEmail: "wrong@example.com",
      });

      expect(expectErr(result)).toBe("confirm_email_mismatch");
      expect(suspend).not.toHaveBeenCalled();
    });

    it("returns user_already_suspended without revoking sessions when already suspended", async () => {
      const listUsers = vi.fn().mockResolvedValue([
        {
          id: "u-2",
          email: "target@example.com",
          displayName: null,
          role: "user",
          status: "suspended" as const,
        },
      ]);
      const suspend = vi.fn();
      const deleteByUserId = vi.fn();
      const userRepository = buildUserRepository({ listUsers, suspend });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository({ deleteByUserId });

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.suspend({
        actorId: "admin-1",
        targetUserId: "u-2",
        confirmEmail: "target@example.com",
      });

      expect(expectErr(result)).toBe("user_not_found");
      expect(deleteByUserId).not.toHaveBeenCalled();
    });

    it("returns user_not_found when the target is missing", async () => {
      const listUsers = vi.fn().mockResolvedValue([]);
      const suspend = vi.fn();
      const deleteByUserId = vi.fn();
      const userRepository = buildUserRepository({ listUsers, suspend });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository({ deleteByUserId });

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.suspend({
        actorId: "admin-1",
        targetUserId: "u-missing",
        confirmEmail: "anyone@example.com",
      });

      expect(expectErr(result)).toBe("user_not_found");
      expect(deleteByUserId).not.toHaveBeenCalled();
    });

    it("revokes the user's active sessions after a successful suspend", async () => {
      const listUsers = vi.fn().mockResolvedValue(buildUsersListFixture());
      const suspend = vi.fn().mockResolvedValue({ ok: true });
      const deleteByUserId = vi.fn().mockResolvedValue(undefined);
      const userRepository = buildUserRepository({ listUsers, suspend });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository({ deleteByUserId });

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.suspend({
        actorId: "admin-1",
        targetUserId: "u-target",
        confirmEmail: "target@example.com",
      });

      expect(result.ok).toBe(true);
      expect(suspend).toHaveBeenCalledWith({
        userId: "u-target",
        actingAdminId: "admin-1",
        now: fixedClock.now(),
      });
      expect(deleteByUserId).toHaveBeenCalledWith("u-target");
    });
  });

  describe("reinstate", () => {
    it("returns self_reinstate when the actor targets themselves", async () => {
      const reinstate = vi.fn();
      const userRepository = buildUserRepository({ reinstate });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.reinstate({
        actorId: "admin-1",
        targetUserId: "admin-1",
      });

      expect(expectErr(result)).toBe("self_reinstate");
      expect(reinstate).not.toHaveBeenCalled();
    });

    it("returns user_already_active when the user is already active", async () => {
      const reinstate = vi.fn().mockResolvedValue({
        ok: false,
        reason: "already_active",
      });
      const userRepository = buildUserRepository({ reinstate });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.reinstate({
        actorId: "admin-1",
        targetUserId: "u-2",
      });

      expect(expectErr(result)).toBe("user_already_active");
    });

    it("returns user_not_found when the repository reports not_found", async () => {
      const reinstate = vi.fn().mockResolvedValue({
        ok: false,
        reason: "not_found",
      });
      const userRepository = buildUserRepository({ reinstate });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.reinstate({
        actorId: "admin-1",
        targetUserId: "u-missing",
      });

      expect(expectErr(result)).toBe("user_not_found");
      expect(reinstate).toHaveBeenCalledWith({
        userId: "u-missing",
        actingAdminId: "admin-1",
        now: fixedClock.now(),
      });
    });

    it("returns ok when the repository succeeds", async () => {
      const reinstate = vi.fn().mockResolvedValue({ ok: true });
      const userRepository = buildUserRepository({ reinstate });
      const inviteRepository = buildInviteRepository();
      const sessionRepository = buildSessionRepository();

      const workflow = createAdminUsersWorkflow({
        userRepository,
        inviteRepository,
        sessionRepository,
        clock: fixedClock,
      });

      const result = await workflow.reinstate({
        actorId: "admin-1",
        targetUserId: "u-2",
      });

      expect(result.ok).toBe(true);
    });
  });
});
