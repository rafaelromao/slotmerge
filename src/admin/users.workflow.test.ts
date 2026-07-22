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
});
