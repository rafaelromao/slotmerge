import { and, asc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { users, type UserRole, type UserStatus } from "../db/schema";

export type UserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
};

export type ChangeRoleResult =
  { ok: true } | { ok: false; reason: "not_found" | "self" };

export type SuspendResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_suspended" | "self" };

export type ReinstateResult =
  { ok: true } | { ok: false; reason: "not_found" | "already_active" | "self" };

export type AdminUserRepository = {
  listUsers(): Promise<UserListItem[]>;
  findActiveUserByEmail(email: string): Promise<UserListItem | null>;
  changeRole(input: {
    userId: string;
    actingAdminId: string;
    role: UserRole;
    now: Date;
  }): Promise<ChangeRoleResult>;
  suspend(input: {
    userId: string;
    actingAdminId: string;
    now: Date;
  }): Promise<SuspendResult>;
  reinstate(input: {
    userId: string;
    actingAdminId: string;
    now: Date;
  }): Promise<ReinstateResult>;
};

export function createPostgresAdminUserRepository(
  db = getDb(),
): AdminUserRepository {
  return {
    async listUsers() {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .orderBy(asc(users.createdAt));

      return rows;
    },

    async findActiveUserByEmail(email) {
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(and(eq(users.email, email), eq(users.status, "active")))
        .limit(1);

      return row ?? null;
    },

    async changeRole({ userId, actingAdminId, role, now }) {
      if (userId === actingAdminId) {
        return { ok: false, reason: "self" };
      }

      const updated = await db
        .update(users)
        .set({ role, updatedAt: now })
        .where(eq(users.id, userId))
        .returning({ id: users.id });

      if (updated.length === 0) {
        return { ok: false, reason: "not_found" };
      }

      return { ok: true };
    },

    async suspend({ userId, actingAdminId, now }) {
      if (userId === actingAdminId) {
        return { ok: false, reason: "self" };
      }

      const updated = await db
        .update(users)
        .set({ status: "suspended", updatedAt: now })
        .where(and(eq(users.id, userId), eq(users.status, "active")))
        .returning({ id: users.id });

      if (updated.length === 0) {
        const exists = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        return exists.length === 0
          ? { ok: false, reason: "not_found" }
          : { ok: false, reason: "already_suspended" };
      }

      return { ok: true };
    },

    async reinstate({ userId, actingAdminId, now }) {
      if (userId === actingAdminId) {
        return { ok: false, reason: "self" };
      }

      const updated = await db
        .update(users)
        .set({ status: "active", updatedAt: now })
        .where(and(eq(users.id, userId), eq(users.status, "suspended")))
        .returning({ id: users.id });

      if (updated.length === 0) {
        const exists = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        return exists.length === 0
          ? { ok: false, reason: "not_found" }
          : { ok: false, reason: "already_active" };
      }

      return { ok: true };
    },
  };
}
