import { describe, expect, it, vi } from "vitest";

import { createAdminUsersWorkflow } from "./users.workflow";
import type { AdminUserRepository, UserListItem } from "./users.repository";
import type { InviteRepository } from "./invites.repository";
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
    findActiveUserByEmail: vi.fn(),
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

      expect(result.users).toEqual(userRows);
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

      expect(result.recentInvites).toEqual([]);
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

      expect(result).toEqual({ ok: false, reason: "self_invite" });
      expect(emailDeliveryService.sendEmail).not.toHaveBeenCalled();
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

      expect(result).toEqual({ ok: false, reason: "email_already_invited" });
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

      expect(result).toEqual({ ok: false, reason: "email_already_invited" });
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

      expect(result).toEqual({
        ok: true,
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
});
