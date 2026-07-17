import { and, desc, eq, gte } from "drizzle-orm";

import { getDb } from "../db/client";
import { emailEvents } from "../db/schema";
import type { EmailType } from "../email/service";

export type FindMostRecentInput = {
  type: EmailType;
  payloadReference: string;
  since: Date;
  status?: "queued" | "sending" | "sent" | "failed";
};

export type EmailDedupLookup = {
  findMostRecent(input: FindMostRecentInput): Promise<Date | null>;
};

export function createPostgresEmailDedupLookup(
  db = getDb(),
): EmailDedupLookup {
  return {
    async findMostRecent({ type, payloadReference, since, status }) {
      const where = status
        ? and(
            eq(emailEvents.type, type),
            eq(emailEvents.payloadReference, payloadReference),
            eq(emailEvents.status, status),
            gte(emailEvents.createdAt, since),
          )
        : and(
            eq(emailEvents.type, type),
            eq(emailEvents.payloadReference, payloadReference),
            gte(emailEvents.createdAt, since),
          );

      const rows = await db
        .select({ createdAt: emailEvents.createdAt })
        .from(emailEvents)
        .where(where)
        .orderBy(desc(emailEvents.createdAt))
        .limit(1);

      return rows[0]?.createdAt ?? null;
    },
  };
}
