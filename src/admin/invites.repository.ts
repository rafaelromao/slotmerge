import { desc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import {
  invites,
  users,
  type InviteRole,
  type InviteStatus,
} from "../db/schema";

export type InviteListItem = {
  id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  invitedByAdminId: string | null;
  invitedByAdminEmail: string | null;
};

export type InviteRecord = InviteListItem & {
  expiresAt: Date;
  magicLinkGeneration?: number;
};

export type CreateInviteResult =
  { ok: true; invite: InviteRecord } | { ok: false; reason: "duplicate" };

export type InviteRepository = {
  listInvites(): Promise<InviteListItem[]>;
  createInvite(input: {
    email: string;
    role: InviteRole;
    invitedByAdminId: string;
    now: Date;
    expiresAt: Date;
  }): Promise<CreateInviteResult>;
};

export type CreateInvitePersistenceInput = {
  email: string;
  role: InviteRole;
  invitedByAdminId: string;
  now: Date;
  expiresAt: Date;
};

export function createPostgresInviteRepository(db = getDb()): InviteRepository {
  return {
    async listInvites() {
      const rows = await db
        .select({
          id: invites.id,
          email: invites.email,
          role: invites.role,
          status: invites.status,
          invitedByAdminId: invites.invitedByAdminId,
          invitedByAdminEmail: users.email,
          magicLinkGeneration: invites.magicLinkGeneration,
        })
        .from(invites)
        .leftJoin(users, eq(invites.invitedByAdminId, users.id))
        .orderBy(desc(invites.createdAt));

      return rows;
    },

    async createInvite(input: CreateInvitePersistenceInput) {
      try {
        const [row] = await db
          .insert(invites)
          .values({
            email: input.email,
            role: input.role,
            status: "pending",
            invitedByAdminId: input.invitedByAdminId,
            expiresAt: input.expiresAt,
            magicLinkGeneration: 0,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning({
            id: invites.id,
            email: invites.email,
            role: invites.role,
            status: invites.status,
            invitedByAdminId: invites.invitedByAdminId,
            expiresAt: invites.expiresAt,
            magicLinkGeneration: invites.magicLinkGeneration,
          });

        if (!row) {
          throw new Error("invite insert returned no row");
        }

        const [admin] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, input.invitedByAdminId))
          .limit(1);

        return {
          ok: true,
          invite: {
            id: row.id,
            email: row.email,
            role: row.role,
            status: row.status,
            invitedByAdminId: row.invitedByAdminId,
            invitedByAdminEmail: admin?.email ?? "",
            expiresAt: row.expiresAt,
            magicLinkGeneration: row.magicLinkGeneration,
          },
        };
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { ok: false, reason: "duplicate" };
        }
        throw error;
      }
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
