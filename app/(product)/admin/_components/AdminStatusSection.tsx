import type { ReactElement } from "react";

import type {
  AdminStatusLoadResult,
  StatusTone,
} from "../../../../src/admin/operational-status.workflow";
import type { TokenRefreshRow } from "../../../../src/admin/operational-status.repository";
import {
  disconnectConnectionAction,
  refreshConnectionAction,
} from "../../me/_actions/calendar-connections";

export type AdminStatusSectionProps = {
  statusResult: AdminStatusLoadResult;
  csrfToken: string;
};

const STATUS_TONE_LABEL: Record<StatusTone, string> = {
  green: "Healthy",
  amber: "Warning",
  red: "Critical",
};

export function AdminStatusSection({
  statusResult,
  csrfToken,
}: AdminStatusSectionProps): ReactElement {
  const generatedAtIso = statusResult.generatedAt.toISOString();

  return (
    <div className="admin-status-section" data-testid="admin-status-section">
      <p
        className="admin-status-generated-at"
        data-testid="admin-status-generated-at"
      >
        Generated at <time dateTime={generatedAtIso}>{generatedAtIso}</time>
      </p>

      <section
        className="admin-status-email-block"
        aria-labelledby="admin-status-email-heading"
        data-testid="admin-status-email-block"
      >
        <div className="admin-status-block-header">
          <h3
            id="admin-status-email-heading"
            className="admin-status-subheading"
          >
            Transactional email delivery
          </h3>
          <span
            className="admin-status-pill"
            data-status={statusResult.health.email}
            data-testid="admin-status-email-pill"
            aria-label={`Email health ${STATUS_TONE_LABEL[statusResult.health.email]}`}
          >
            {STATUS_TONE_LABEL[statusResult.health.email]}
          </span>
        </div>
        {statusResult.health.email !== "green" ? (
          <p
            className="admin-status-warning admin-status-email-warning"
            role="alert"
            data-testid="admin-status-email-warning"
          >
            Email delivery is degraded. The latest <code>emailEvent</code> rows
            in the DB are the source of truth; a re-run is automatic on the next
            retry window.
          </p>
        ) : null}
        <p className="admin-status-window-note">
          Last {statusResult.windowHours} hours
        </p>
        <dl
          className="admin-status-counts"
          data-testid="admin-status-email-counts"
        >
          <div className="admin-status-count-row">
            <dt>Pending</dt>
            <dd>{statusResult.pendingEmailCount}</dd>
          </div>
          <div className="admin-status-count-row">
            <dt>Sent</dt>
            <dd>{statusResult.email.counts.sent}</dd>
          </div>
          <div className="admin-status-count-row">
            <dt>Failed</dt>
            <dd>{statusResult.email.counts.failed}</dd>
          </div>
          <div className="admin-status-count-row">
            <dt>Failure rate</dt>
            <dd>{statusResult.emailFailureRate.toFixed(2)}%</dd>
          </div>
        </dl>
      </section>

      <section
        className="admin-status-calendar-block"
        aria-labelledby="admin-status-calendar-heading"
        data-testid="admin-status-calendar-block"
      >
        <div className="admin-status-block-header">
          <h3
            id="admin-status-calendar-heading"
            className="admin-status-subheading"
          >
            Calendar connections
          </h3>
          <span
            className="admin-status-pill"
            data-status={statusResult.health.calendar}
            data-testid="admin-status-calendar-pill"
            aria-label={`Calendar health ${STATUS_TONE_LABEL[statusResult.health.calendar]}`}
          >
            {STATUS_TONE_LABEL[statusResult.health.calendar]}
          </span>
        </div>
        {statusResult.health.calendar !== "green" ? (
          <p
            className="admin-status-warning admin-status-calendar-warning"
            role="alert"
            data-testid="admin-status-calendar-warning"
          >
            One or more Calendar connections need reconnect. Visit{" "}
            <code>/me/calendar-connections</code> on the affected User&apos;s
            account to reconnect.
          </p>
        ) : null}
        <div className="admin-status-tokens-table-wrap">
          <table
            className="admin-status-tokens-table"
            data-testid="admin-status-calendar-table"
          >
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Pending</th>
                <th scope="col">Connected</th>
                <th scope="col">Needs reconnect</th>
                <th scope="col">Disconnected</th>
              </tr>
            </thead>
            <tbody>
              {statusResult.calendar.byProvider.map((row) => (
                <tr
                  key={row.provider}
                  data-testid={`admin-status-calendar-row-${row.provider}`}
                >
                  <th scope="row">{providerLabel(row.provider)}</th>
                  <td>{row.counts.pending}</td>
                  <td>{row.counts.connected}</td>
                  <td>{row.counts.needsReconnect}</td>
                  <td>{row.counts.disconnected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="admin-status-tokens-block"
        aria-labelledby="admin-status-tokens-heading"
        data-testid="admin-status-tokens-block"
      >
        <div className="admin-status-block-header">
          <h3
            id="admin-status-tokens-heading"
            className="admin-status-subheading"
          >
            Tokens needing refresh
          </h3>
          <span
            className="admin-status-pill"
            data-status={statusResult.health.tokens}
            data-testid="admin-status-tokens-pill"
            aria-label={`Tokens health ${STATUS_TONE_LABEL[statusResult.health.tokens]}`}
          >
            {STATUS_TONE_LABEL[statusResult.health.tokens]}
          </span>
        </div>
        {statusResult.calendar.tokensNeedingRefresh.length === 0 ? (
          <div
            className="empty-state"
            role="status"
            data-testid="admin-status-tokens-empty"
          >
            <p className="empty-state-title">
              No tokens need refresh right now
            </p>
            <p className="empty-state-message">
              Every connected calendar&rsquo;s access token is fresh.
            </p>
            <a
              className="btn btn-primary"
              href="/admin#users"
              data-testid="admin-status-tokens-empty-cta"
            >
              Back to Users
            </a>
          </div>
        ) : (
          <div className="admin-status-tokens-table-wrap">
            <table
              className="admin-status-tokens-table"
              data-testid="admin-status-tokens-table"
            >
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Account</th>
                  <th scope="col">Access token expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {statusResult.calendar.tokensNeedingRefresh.map((row) => (
                  <TokenRow
                    key={row.connectionId}
                    row={row}
                    csrfToken={csrfToken}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function providerLabel(provider: string): string {
  if (provider === "google") return "Google Calendar";
  if (provider === "microsoft") return "Microsoft Calendar";
  return provider;
}

function bucketLabel(bucket: TokenRefreshRow["bucket"]): string {
  if (bucket === "expired") return "Expired";
  if (bucket === "expiring_soon") return "Expiring soon";
  return "Unset";
}

function TokenRow({
  row,
  csrfToken,
}: {
  row: TokenRefreshRow;
  csrfToken: string;
}): ReactElement {
  const confirmInputId = `admin-status-tokens-confirm-${row.connectionId}`;
  const confirmHintId = `admin-status-tokens-confirm-hint-${row.connectionId}`;
  const expiresIso = row.accessTokenExpiresAt
    ? row.accessTokenExpiresAt.toISOString()
    : "—";
  return (
    <tr data-testid={`admin-status-tokens-row-${row.connectionId}`}>
      <td>{row.userId}</td>
      <td>{providerLabel(row.provider)}</td>
      <td>{row.accountIdentifier ?? "(no account on file)"}</td>
      <td>
        {row.accessTokenExpiresAt ? (
          <time dateTime={expiresIso}>{expiresIso}</time>
        ) : (
          expiresIso
        )}{" "}
        <span className="admin-status-tokens-bucket">
          {bucketLabel(row.bucket)}
        </span>
      </td>
      <td>
        <div className="admin-status-tokens-actions">
          <form
            method="POST"
            action={refreshConnectionAction}
            className="admin-status-tokens-refresh-form"
            data-testid={`admin-status-tokens-refresh-form-${row.connectionId}`}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="connectionId" value={row.connectionId} />
            <button
              type="submit"
              className="btn btn-secondary"
              data-testid={`admin-status-tokens-refresh-${row.connectionId}`}
            >
              Refresh
            </button>
          </form>
          <form
            method="POST"
            action={disconnectConnectionAction}
            className="admin-status-tokens-disconnect-form"
            data-testid={`admin-status-tokens-disconnect-form-${row.connectionId}`}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="connectionId" value={row.connectionId} />
            <label
              htmlFor={confirmInputId}
              className="admin-status-tokens-disconnect-label"
            >
              Type the account identifier to disconnect
              <input
                id={confirmInputId}
                type="text"
                name="confirmAccountIdentifier"
                required
                className="admin-status-tokens-disconnect-input"
                data-testid={`admin-status-tokens-disconnect-confirm-${row.connectionId}`}
                aria-describedby={confirmHintId}
              />
              <span
                id={confirmHintId}
                className="admin-status-tokens-disconnect-hint"
              >
                {row.accountIdentifier ?? "(no account on file)"}
              </span>
            </label>
            <button
              type="submit"
              className="btn btn-danger"
              data-testid={`admin-status-tokens-disconnect-${row.connectionId}`}
            >
              Disconnect
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
