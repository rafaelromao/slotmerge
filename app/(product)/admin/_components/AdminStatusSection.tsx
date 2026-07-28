import type {
  AdminStatusLoadResult,
  StatusTone,
} from "../../../../src/admin/operational-status.workflow";

export type AdminStatusSectionProps = {
  statusResult: AdminStatusLoadResult;
};

const STATUS_TONE_LABEL: Record<StatusTone, string> = {
  green: "Healthy",
  amber: "Warning",
  red: "Critical",
};

export function AdminStatusSection({
  statusResult,
}: AdminStatusSectionProps): JSX.Element {
  const generatedAtIso = statusResult.generatedAt.toISOString();

  return (
    <div className="admin-status-section" data-testid="admin-status-body">
      <p
        className="admin-status-generated-at"
        data-testid="admin-status-generated-at"
      >
        Generated at{" "}
        <time dateTime={generatedAtIso}>{generatedAtIso}</time>
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
        <p className="admin-status-window-note">
          Last {statusResult.windowHours} hours
        </p>
        <dl className="admin-status-counts" data-testid="admin-status-email-counts">
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
            <dd>
              {statusResult.emailFailureRate.toFixed(2)}%
            </dd>
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
        <table
          className="admin-status-calendar-table"
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
      </section>
    </div>
  );
}

function providerLabel(provider: string): string {
  if (provider === "google") return "Google Calendar";
  if (provider === "microsoft") return "Microsoft Calendar";
  return provider;
}