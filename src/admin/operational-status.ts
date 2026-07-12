import { getSessionFromRequest, type Session } from "../auth/session";
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
const EMAIL_WINDOW_HOURS = 24;

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

export type AdminStatusDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  statusRepository?: OperationalStatusRepository;
  clock?: () => Date;
};

export function createAdminStatusHandlers({
  getSession = getSessionFromRequest,
  statusRepository = databaseOperationalStatusRepository,
  clock = () => new Date(),
}: AdminStatusDependencies = {}) {
  const repository = statusRepository;
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return createAccessDeniedResponse(session);
      }

      const now = clock();
      const since = new Date(
        now.getTime() - EMAIL_WINDOW_HOURS * 60 * 60 * 1000,
      );
      const [email, calendar] = await Promise.all([
        repository.summarizeEmailDelivery({ since }),
        repository.summarizeCalendarConnections({ now }),
      ]);

      return htmlResponse(
        renderOperationalStatusPage({
          generatedAt: now,
          windowHours: EMAIL_WINDOW_HOURS,
          email,
          calendar,
        }),
      );
    },
  };
}

function isAdminSession(session: Session | null): session is Session {
  return session?.user.role === "admin";
}

function createAccessDeniedResponse(session: Session | null): Response {
  return htmlResponse(
    session
      ? "<h1>Forbidden</h1><p>Admin access required.</p>"
      : "<h1>Unauthorized</h1><p>Sign in required.</p>",
    session ? 403 : 401,
  );
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderOperationalStatusPage({
  generatedAt,
  windowHours,
  email,
  calendar,
}: {
  generatedAt: Date;
  windowHours: number;
  email: EmailDeliverySummary;
  calendar: CalendarConnectionSummary;
}): string {
  const totalEmail =
    email.counts.queued +
    email.counts.sending +
    email.counts.sent +
    email.counts.failed;
  const emailSection = renderEmailSection(email, windowHours, totalEmail);
  const calendarSection = renderCalendarSection(calendar);

  return `<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Operational status</h1>
      <p>Generated at ${escapeHtml(generatedAt.toISOString())}</p>
      ${emailSection}
      ${calendarSection}
    </main>
  </body>
</html>`;
}

function renderEmailSection(
  email: EmailDeliverySummary,
  windowHours: number,
  totalEmail: number,
): string {
  const emptyState =
    totalEmail === 0 ? `<p>No email events recorded yet.</p>` : "";
  const failures =
    email.recentFailures.length === 0
      ? `<p>No failures in the last ${windowHours} hours.</p>`
      : `<table>
            <thead>
              <tr>
                <th>When</th>
                <th>Recipient</th>
                <th>Type</th>
                <th>Code</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              ${email.recentFailures
                .map(
                  (f) => `
                <tr>
                  <td>${escapeHtml(f.failedAt.toISOString())}</td>
                  <td>${escapeHtml(f.recipient)}</td>
                  <td>${escapeHtml(f.type)}</td>
                  <td>${escapeHtml(f.code ?? "")}</td>
                  <td>${escapeHtml(f.message ?? "")}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>`;

  return `<section>
        <h2>Transactional email delivery</h2>
        <p>Last ${windowHours} hours</p>
        ${emptyState}
        <ul>
          <li>Queued: ${email.counts.queued}</li>
          <li>Sending: ${email.counts.sending}</li>
          <li>Sent: ${email.counts.sent}</li>
          <li>Failed: ${email.counts.failed}</li>
        </ul>
        <h3>Recent failures</h3>
        ${failures}
      </section>`;
}

function renderCalendarSection(calendar: CalendarConnectionSummary): string {
  const tokensRows =
    calendar.tokensNeedingRefresh.length === 0
      ? `<tr><td colspan="5">No tokens needing refresh.</td></tr>`
      : calendar.tokensNeedingRefresh
          .map(
            (row) => `
            <tr>
              <td>${escapeHtml(row.bucket)}</td>
              <td>${escapeHtml(row.provider)}</td>
              <td>${escapeHtml(row.accountIdentifier ?? "")}</td>
              <td>${escapeHtml(row.accessTokenExpiresAt ? row.accessTokenExpiresAt.toISOString() : "—")}</td>
              <td>${escapeHtml(row.userId)}</td>
            </tr>`,
          )
          .join("");

  return `<section>
        <h2>Calendar Connections</h2>
        <ul>
          <li>Pending: ${calendar.counts.pending}</li>
          <li>Connected: ${calendar.counts.connected}</li>
          <li>Disconnected: ${calendar.counts.disconnected}</li>
        </ul>
        <h3>Tokens needing refresh</h3>
        <table>
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Provider</th>
              <th>Account</th>
              <th>Access token expires at</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>${tokensRows}</tbody>
        </table>
      </section>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const databaseOperationalStatusRepository: OperationalStatusRepository = {
  async summarizeEmailDelivery({ since }) {
    const db = getDb();
    const counts = await db
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

    return { since, counts, recentFailures };
  },

  async summarizeCalendarConnections({ now }) {
    const db = getDb();
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

export const __testing = {
  RECENT_FAILURE_LIMIT,
  TOKEN_EXPIRING_SOON_MS,
};
