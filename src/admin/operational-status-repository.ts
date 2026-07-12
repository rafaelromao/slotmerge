import { and, count, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";

import { getDb } from "../db/client";
import { calendarConnections, emailEvents } from "../db/schema";
import {
  type CalendarConnectionSummary,
  type EmailDeliverySummary,
  type OperationalStatusRepository,
  type TokenRefreshRow,
} from "./operational-status";

const RECENT_FAILURE_LIMIT = 5;
const TOKEN_EXPIRING_SOON_MS = 5 * 60 * 1000;

export function createPostgresOperationalStatusRepository(
  db = getDb(),
): OperationalStatusRepository {
  return {
    async summarizeEmailDelivery({ since }): Promise<EmailDeliverySummary> {
      const counts = await readEmailCounts(db, since);
      const recentFailures = await readRecentFailures(db, since);
      return { since, counts, recentFailures };
    },

    async summarizeCalendarConnections({
      now,
    }): Promise<CalendarConnectionSummary> {
      const counts = await readCalendarCounts(db);
      const tokensNeedingRefresh = await readTokensNeedingRefresh(db, now);
      return { counts, tokensNeedingRefresh };
    },
  };
}

function readEmailCounts(
  db: ReturnType<typeof getDb>,
  since: Date,
): Promise<EmailDeliverySummary["counts"]> {
  return db
    .select({ status: emailEvents.status, value: count() })
    .from(emailEvents)
    .where(gte(emailEvents.createdAt, since))
    .groupBy(emailEvents.status)
    .then((rows) => {
      const empty = { queued: 0, sending: 0, sent: 0, failed: 0 };
      for (const row of rows) {
        if (row.status === "queued") empty.queued = Number(row.value);
        else if (row.status === "sending") empty.sending = Number(row.value);
        else if (row.status === "sent") empty.sent = Number(row.value);
        else if (row.status === "failed") empty.failed = Number(row.value);
      }
      return empty;
    });
}

function readRecentFailures(
  db: ReturnType<typeof getDb>,
  since: Date,
): Promise<EmailDeliverySummary["recentFailures"]> {
  return db
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
      and(eq(emailEvents.status, "failed"), gte(emailEvents.failedAt, since)),
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
}

function readCalendarCounts(
  db: ReturnType<typeof getDb>,
): Promise<CalendarConnectionSummary["counts"]> {
  return db
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
}

async function readTokensNeedingRefresh(
  db: ReturnType<typeof getDb>,
  now: Date,
): Promise<TokenRefreshRow[]> {
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
        gte(calendarConnections.accessTokenExpiresAt, now),
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

  return [
    ...expired.map((r) => ({ ...r, bucket: "expired" as const })),
    ...expiringSoonRows.map((r) => ({
      ...r,
      bucket: "expiring_soon" as const,
    })),
    ...unsetRows.map((r) => ({ ...r, bucket: "unset" as const })),
  ];
}
