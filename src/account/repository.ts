import { eq, inArray, or } from "drizzle-orm";

import { createConnectionActionRequiredDedupReference } from "../calendar/action-required-email";
import { getDb, type AppDb } from "../db/client";
import { calendarConnections, emailEvents, users } from "../db/schema";
import type { AccountRepository } from "../workflow/account";

export function createPostgresAccountRepository(
  db: AppDb = getDb(),
): AccountRepository {
  return {
    async selfDelete(userId) {
      return db.transaction(async (tx) => {
        const [user] = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user) {
          return false;
        }

        const connections = await tx
          .select({ id: calendarConnections.id })
          .from(calendarConnections)
          .where(eq(calendarConnections.userId, userId));
        const personalPayloadReferences = connections.flatMap(({ id }) => [
          createConnectionActionRequiredDedupReference(id, "token-revoked"),
          createConnectionActionRequiredDedupReference(id, "sync-failure"),
        ]);
        const personalEmailPredicate =
          personalPayloadReferences.length === 0
            ? eq(emailEvents.recipient, user.email)
            : or(
                eq(emailEvents.recipient, user.email),
                inArray(
                  emailEvents.payloadReference,
                  personalPayloadReferences,
                ),
              );

        await tx.delete(emailEvents).where(personalEmailPredicate);
        const deleted = await tx
          .delete(users)
          .where(eq(users.id, userId))
          .returning({ id: users.id });

        return deleted.length > 0;
      });
    },
  };
}
