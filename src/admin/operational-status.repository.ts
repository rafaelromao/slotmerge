import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections, emailEvents } from "../db/schema";

const RECENT_FAILURE_LIMIT = 5;
const TOKEN_EXPIRING_SOON_MS = 5 * 60 * 1000;

export type EmailDeliverySummary = {
  since: Date;
  counts: {
    queued: number;
    sending: number;
    sent: number;
    failed: number;
  };
  recentFailures: Array<{
    emailEventId: string;
    recipient: string;
    type: string;
    code: string | null;
    message: string | null;
    failedAt: Date;
  }>;
};

export type TokenRefreshRow = {
  connectionId: string;
  userId: string;
  provider: string;
  accountIdentifier: string | null;
  status: string;
  accessTokenExpiresAt: Date | null;
  bucket: "expired" | "expiring_soon" | "unset";
};

export type CalendarConnectionSummary = {
  counts: {
    pending: number;
    connected: number;
    disconnected: number;
  };
  tokensNeedingRefresh: TokenRefreshRow[];
};

export type OperationalStatusRepository = {
  summarizeEmailDelivery(input: { since: Date }): Promise<EmailDeliverySummary>;
  summarizeCalendarConnections(input: {
    now: Date;
  }): Promise<CalendarConnectionSummary>;
};

export function createPostgresOperationalStatusRepository(
  db = getDb(),
): OperationalStatusRepository {
  return {
    async summarizeEmailDelivery({ since }) {
      const counts = await db
        .select({ status: emailEvents.status, value: count() })
        .from(emailEvents)
        .where(gte(emailEvents.createdAt, since))
        .groupBy(emailEvents.status)
        .then((rows) => {
          const empty = { queued: 0, sending: 0, sent: 0, failed: 0 };
          for (const row of rows) {
            if (row.status === "queued") empty.queued = Number(row.value);
            else if (row.status === "sending")
              empty.sending = Number(row.value);
            else if (row.status === "sent") empty.sent = Number(row.value);
            else if (row.status === "failed") empty.failed = Number(row.value);
          }
          return empty;
        });

      const recentFailures = await db
        .select({
          emailEventId: emailEvents.id,
          recipient: emailEvents.recipient,
          type: emailEvents.type,
          code: emailEvents.lastErrorCode,
          message: emailEvents.lastErrorMessage,
          failedAt: emailEvents.failedAt,
        })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.status, "failed"),
            gte(emailEvents.failedAt, since),
          ),
        )
        .orderBy(desc(emailEvents.failedAt))
        .limit(RECENT_FAILURE_LIMIT)
        .then((rows) =>
          rows.map((row) => ({
            emailEventId: row.emailEventId,
            recipient: row.recipient,
            type: row.type,
            code: row.code ?? null,
            message: row.message ?? null,
            failedAt: row.failedAt as Date,
          })),
        );

      return { since, counts, recentFailures };
    },

    async summarizeCalendarConnections({ now }) {
      const counts = await db
        .select({ status: calendarConnections.status, value: count() })
        .from(calendarConnections)
        .groupBy(calendarConnections.status)
        .then((rows) => {
          const empty = { pending: 0, connected: 0, disconnected: 0 };
          for (const row of rows) {
            if (row.status === "pending") empty.pending = Number(row.value);
            else if (row.status === "connected")
              empty.connected = Number(row.value);
            else if (row.status === "disconnected")
              empty.disconnected = Number(row.value);
          }
          return empty;
        });

      const expiringSoon = new Date(now.getTime() + TOKEN_EXPIRING_SOON_MS);

      const expired = await db
        .select({
          connectionId: calendarConnections.id,
          userId: calendarConnections.userId,
          provider: calendarConnections.provider,
          accountIdentifier: calendarConnections.accountIdentifier,
          status: calendarConnections.status,
          accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.status, "connected"),
            isNotNull(calendarConnections.accessTokenExpiresAt),
            lte(calendarConnections.accessTokenExpiresAt, now),
          ),
        );

      const expiringSoonRows = await db
        .select({
          connectionId: calendarConnections.id,
          userId: calendarConnections.userId,
          provider: calendarConnections.provider,
          accountIdentifier: calendarConnections.accountIdentifier,
          status: calendarConnections.status,
          accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.status, "connected"),
            isNotNull(calendarConnections.accessTokenExpiresAt),
            gt(calendarConnections.accessTokenExpiresAt, now),
            lte(calendarConnections.accessTokenExpiresAt, expiringSoon),
          ),
        );

      const unsetRows = await db
        .select({
          connectionId: calendarConnections.id,
          userId: calendarConnections.userId,
          provider: calendarConnections.provider,
          accountIdentifier: calendarConnections.accountIdentifier,
          status: calendarConnections.status,
          accessTokenExpiresAt: calendarConnections.accessTokenExpiresAt,
        })
        .from(calendarConnections)
        .where(
          and(
            eq(calendarConnections.status, "connected"),
            isNull(calendarConnections.accessTokenExpiresAt),
          ),
        );

      return {
        counts,
        tokensNeedingRefresh: [
          ...expired.map((r) => ({ ...r, bucket: "expired" as const })),
          ...expiringSoonRows.map((r) => ({
            ...r,
            bucket: "expiring_soon" as const,
          })),
          ...unsetRows.map((r) => ({ ...r, bucket: "unset" as const })),
        ],
      };
    },
  };
}
