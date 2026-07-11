import { and, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { emailEventAttempts, emailEvents } from "../db/schema";
import type { EmailEvent, EmailEventRepository } from "./service";

type EmailEventRow = typeof emailEvents.$inferSelect;

export function createPostgresEmailEventRepository(
  db = getDb(),
): EmailEventRepository {
  return {
    async createQueuedEvent(input) {
      const [row] = await db
        .insert(emailEvents)
        .values({
          recipient: input.recipient,
          type: input.type,
          payload: input.payload,
          status: "queued",
          attempts: 0,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning();

      return toEmailEvent(row);
    },

    async recordAttempt(emailEventId, attemptedAt) {
      const current = await getCurrentEmailEventAttemptCount(db, emailEventId);
      const attempts = current + 1;

      const [row] = await db
        .update(emailEvents)
        .set({
          status: "sending",
          attempts,
          lastAttemptAt: attemptedAt,
          updatedAt: attemptedAt,
        })
        .where(eq(emailEvents.id, emailEventId))
        .returning();

      await db.insert(emailEventAttempts).values({
        emailEventId,
        attemptNumber: attempts,
        status: "sending",
        attemptedAt,
      });

      return toEmailEvent(row);
    },

    async markDelivered(emailEventId, deliveredAt, providerMessageId) {
      const current = await getCurrentEmailEventAttemptCount(db, emailEventId);

      const [row] = await db
        .update(emailEvents)
        .set({
          status: "sent",
          sentAt: deliveredAt,
          failedAt: null,
          lastAttemptAt: deliveredAt,
          lastErrorCode: null,
          lastErrorMessage: null,
          providerMessageId: providerMessageId ?? null,
          updatedAt: deliveredAt,
        })
        .where(eq(emailEvents.id, emailEventId))
        .returning();

      await db
        .update(emailEventAttempts)
        .set({
          deliveredAt,
          providerMessageId: providerMessageId ?? null,
          status: "sent",
        })
        .where(
          and(
            eq(emailEventAttempts.emailEventId, emailEventId),
            eq(emailEventAttempts.attemptNumber, current),
          ),
        );

      return toEmailEvent(row);
    },

    async markFailed(emailEventId, failedAt, error) {
      const current = await getCurrentEmailEventAttemptCount(db, emailEventId);

      const [row] = await db
        .update(emailEvents)
        .set({
          status: "failed",
          failedAt,
          lastAttemptAt: failedAt,
          lastErrorCode: error.code ?? null,
          lastErrorMessage: error.message,
          updatedAt: failedAt,
        })
        .where(eq(emailEvents.id, emailEventId))
        .returning();

      await db
        .update(emailEventAttempts)
        .set({
          failedAt,
          errorCode: error.code ?? null,
          errorMessage: error.message,
          status: "failed",
        })
        .where(
          and(
            eq(emailEventAttempts.emailEventId, emailEventId),
            eq(emailEventAttempts.attemptNumber, current),
          ),
        );

      return toEmailEvent(row);
    },
  };
}

async function getCurrentEmailEventAttemptCount(
  db: ReturnType<typeof getDb>,
  emailEventId: string,
): Promise<number> {
  const [row] = await db
    .select({ attempts: emailEvents.attempts })
    .from(emailEvents)
    .where(eq(emailEvents.id, emailEventId))
    .limit(1);

  return row?.attempts ?? 0;
}

function toEmailEvent(row: EmailEventRow): EmailEvent {
  if (!row) {
    throw new Error("email event was not found");
  }

  return {
    id: row.id,
    recipient: row.recipient,
    type: row.type as EmailEvent["type"],
    payload: row.payload as EmailEvent["payload"],
    status: row.status as EmailEvent["status"],
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sentAt: row.sentAt,
    failedAt: row.failedAt,
    lastAttemptAt: row.lastAttemptAt,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
  };
}
