import { getSessionFromRequest, type Session } from "../auth/session";
import {
  adminAccessDeniedResponse,
  escapeHtml,
  htmlResponse,
  isAdminSession,
  renderAdminShell,
} from "./page";
import {
  createPostgresOperationalStatusRepository,
  type CalendarConnectionSummary,
  type EmailDeliverySummary,
  type OperationalStatusRepository,
} from "./operational-status.repository";

export type {
  CalendarConnectionSummary,
  EmailDeliverySummary,
  OperationalStatusRepository,
  TokenRefreshRow,
} from "./operational-status.repository";

const EMAIL_WINDOW_HOURS = 24;

export type AdminStatusDependencies = {
  getSession?: (request: Request) => Promise<Session | null>;
  statusRepository?: OperationalStatusRepository;
  clock?: () => Date;
};

export function createAdminStatusHandlers({
  getSession = getSessionFromRequest,
  statusRepository = createPostgresOperationalStatusRepository(),
  clock = () => new Date(),
}: AdminStatusDependencies = {}) {
  const repository = statusRepository;
  return {
    GET: async (request: Request): Promise<Response> => {
      const session = await getSession(request);
      if (!isAdminSession(session)) {
        return adminAccessDeniedResponse(session);
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
        renderAdminShell({
          title: "Operational status",
          body: renderOperationalStatusBody({
            generatedAt: now,
            windowHours: EMAIL_WINDOW_HOURS,
            email,
            calendar,
          }),
        }),
      );
    },
  };
}

function renderOperationalStatusBody({
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

  return `<p>Generated at ${escapeHtml(generatedAt.toISOString())}</p>
    ${emailSection}
    ${calendarSection}`;
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
