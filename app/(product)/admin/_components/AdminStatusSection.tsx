import type { AdminStatusLoadResult } from "../../../../src/admin/operational-status.workflow";

export type AdminStatusSectionProps = {
  statusResult: AdminStatusLoadResult;
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
        <h3 id="admin-status-email-heading" className="admin-status-subheading">
          Transactional email delivery
        </h3>
        <p className="admin-status-window-note">
          Last {statusResult.windowHours} hours
        </p>
      </section>

      <section
        className="admin-status-calendar-block"
        aria-labelledby="admin-status-calendar-heading"
        data-testid="admin-status-calendar-block"
      >
        <h3
          id="admin-status-calendar-heading"
          className="admin-status-subheading"
        >
          Calendar connections
        </h3>
      </section>

      <section
        className="admin-status-tokens-block"
        aria-labelledby="admin-status-tokens-heading"
        data-testid="admin-status-tokens-block"
      >
        <h3 id="admin-status-tokens-heading" className="admin-status-subheading">
          Tokens needing refresh
        </h3>
      </section>
    </div>
  );
}