import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { users } from "../db/schema";
import { createPostgresEmailDedupLookup } from "../email/dedup.repository";
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
  const lookup = createPostgresEmailDedupLookup(db);

  return {
    async findMostRecentKindDispatch(kind, since) {
      return lookup.findMostRecent({
        type: "admin-critical",
        payloadReference: createKindDedupReference(kind),
        since,
      });
    },
  };
}
