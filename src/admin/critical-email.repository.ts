import { and, desc, eq, gte } from "drizzle-orm";

import { getDb } from "../db/client";
import { emailEvents, users } from "../db/schema";
import {
  createKindDedupReference,
  type AdminCriticalDispatchLookup,
  type AdminDirectory,
  type AdminDirectoryEntry,
} from "./critical-email";

export function createPostgresAdminDirectory(db = getDb()): AdminDirectory {
  return {
    async listActiveAdmins(): Promise<AdminDirectoryEntry[]> {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
        })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active")))
        .orderBy(users.email);

      return rows;
    },
  };
}

export function createPostgresAdminCriticalDispatchLookup(
  db = getDb(),
): AdminCriticalDispatchLookup {
  return {
    async findMostRecentKindDispatch(kind, since) {
      const reference = createKindDedupReference(kind);

      const rows = await db
        .select({ createdAt: emailEvents.createdAt })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.type, "admin-critical"),
            eq(emailEvents.payloadReference, reference),
            gte(emailEvents.createdAt, since),
          ),
        )
        .orderBy(desc(emailEvents.createdAt))
        .limit(1);

      return rows[0]?.createdAt ?? null;
    },
  };
}
