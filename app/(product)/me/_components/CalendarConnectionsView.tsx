import type {
  CalendarConnectionDisplayStatus,
  CalendarConnectionPageItem,
  CalendarConnectionPageState,
} from "../../../../src/workflow/calendar-connection";

export type CalendarConnectionsViewProps = {
  csrfToken: string;
  pageState: CalendarConnectionPageState | null;
  outcome: {
    kind: "connected" | "denied" | "unsupported" | "failed" | "none";
    requestId?: string;
  };
  saveAction: (formData: FormData) => void | Promise<void>;
  refreshAction: (formData: FormData) => void | Promise<void>;
  disconnectAction: (formData: FormData) => void | Promise<void>;
};

const STATUS_LABELS: Record<CalendarConnectionDisplayStatus, string> = {
  connected: "Connected",
  sync_delayed: "Sync delayed",
  needs_reconnect: "Needs reconnect",
  unsupported: "Unsupported",
  failed: "Failed",
};

const PROVIDER_LABELS: Record<"google" | "microsoft", string> = {
  google: "Google Calendar",
  microsoft: "Microsoft Calendar",
};

function lastSyncLabel(lastSyncAt: Date | null, stale: boolean): string {
  if (!lastSyncAt) {
    return "No sync recorded yet";
  }
  const stamp = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(lastSyncAt);
  return stale ? `Last sync ${stamp} (stale)` : `Last sync ${stamp}`;
}

function statusToDataTestId(status: CalendarConnectionDisplayStatus): string {
  return `calendar-connection-status-${status.replace(/_/g, "-")}`;
}

function outcomeBanner(
  outcome: CalendarConnectionsViewProps["outcome"],
): { tone: string; body: string } | null {
  if (outcome.kind === "none") return null;
  if (outcome.kind === "connected") {
    return {
      tone: "calendar-connection-banner calendar-connection-banner-success",
      body: "Calendar connection ready. Select the calendars you want to contribute.",
    };
  }
  if (outcome.kind === "denied") {
    return {
      tone: "calendar-connection-banner calendar-connection-banner-warning",
      body: "Calendar connection was denied. You can try connecting again at any time.",
    };
  }
  if (outcome.kind === "unsupported") {
    return {
      tone: "calendar-connection-banner calendar-connection-banner-warning",
      body: "Microsoft personal accounts are not supported. Use a work or school account to connect.",
    };
  }
  return {
    tone: "calendar-connection-banner calendar-connection-banner-error",
    body: outcome.requestId
      ? `Calendar connection could not be completed. Reference: ${outcome.requestId}.`
      : "Calendar connection could not be completed. Please try again.",
  };
}

export function CalendarConnectionsView(props: CalendarConnectionsViewProps) {
  const {
    csrfToken,
    pageState,
    outcome,
    saveAction,
    refreshAction,
    disconnectAction,
  } = props;
  const banner = outcomeBanner(outcome);
  const connections = pageState?.connections ?? [];
  const hasConnections = connections.length > 0;

  return (
    <main
      className="app-container calendar-connection-page"
      data-testid="calendar-connection-page"
    >
      <h1 data-testid="calendar-connection-page-heading">
        Calendar connections
      </h1>
      <p className="calendar-connection-intro">
        Connect a calendar to import busy times. SlotMerge only ever reads your
        free/busy data and never your event titles, locations, or attendees.
      </p>

      {banner ? (
        <div
          className={banner.tone}
          role={outcome.kind === "failed" ? "alert" : "status"}
          aria-live={outcome.kind === "failed" ? "assertive" : "polite"}
          data-testid={`calendar-connection-banner-${outcome.kind}`}
          data-outcome={outcome.kind}
        >
          <p>{banner.body}</p>
        </div>
      ) : null}

      <section
        className="calendar-connection-section"
        aria-labelledby="calendar-connection-connect-heading"
        data-testid="calendar-connection-connect-section"
      >
        <h2 id="calendar-connection-connect-heading">Connect a calendar</h2>
        <div className="calendar-connection-connect-grid">
          <form
            method="POST"
            action="/me/calendar-connections/connect/google"
            className="calendar-connection-connect-form"
            data-testid="calendar-connection-connect-google-form"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="calendar-connection-connect-google"
            >
              Connect Google Calendar
            </button>
          </form>
          <form
            method="POST"
            action="/me/calendar-connections/connect/microsoft"
            className="calendar-connection-connect-form"
            data-testid="calendar-connection-connect-microsoft-form"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="calendar-connection-connect-microsoft"
            >
              Connect Microsoft Calendar
            </button>
          </form>
        </div>
      </section>

      <section
        className="calendar-connection-section"
        aria-labelledby="calendar-connection-list-heading"
        data-testid="calendar-connection-list-section"
      >
        <h2 id="calendar-connection-list-heading">Your calendar connections</h2>
        {!pageState ? (
          <p
            role="alert"
            aria-live="assertive"
            data-testid="calendar-connection-list-error"
          >
            We could not load your calendar connections. Please refresh the
            page.
          </p>
        ) : !hasConnections ? (
          <div className="empty-state" data-testid="calendar-connection-empty">
            <p className="empty-state-title">
              You have no calendar connections yet.
            </p>
            <p>
              Use one of the buttons above to connect your Google or Microsoft
              calendar.
            </p>
          </div>
        ) : (
          <ul
            className="calendar-connection-list"
            data-testid="calendar-connection-list"
          >
            {connections.map((connection) => (
              <CalendarConnectionCard
                key={connection.id}
                connection={connection}
                csrfToken={csrfToken}
                saveAction={saveAction}
                refreshAction={refreshAction}
                disconnectAction={disconnectAction}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CalendarConnectionCard({
  connection,
  csrfToken,
  saveAction,
  refreshAction,
  disconnectAction,
}: {
  connection: CalendarConnectionPageItem;
  csrfToken: string;
  saveAction: CalendarConnectionsViewProps["saveAction"];
  refreshAction: CalendarConnectionsViewProps["refreshAction"];
  disconnectAction: CalendarConnectionsViewProps["disconnectAction"];
}) {
  const providerLabel = PROVIDER_LABELS[connection.provider];
  const statusLabel = STATUS_LABELS[connection.displayStatus];
  const lastSync = lastSyncLabel(connection.lastSyncAt, connection.stale);
  const showCalendars =
    connection.calendars.length > 0 || connection.calendarsError;
  const allowEdit =
    connection.displayStatus !== "needs_reconnect" &&
    connection.displayStatus !== "unsupported";

  return (
    <li
      className={`calendar-connection-card calendar-connection-card--${connection.displayStatus}`}
      data-testid={`calendar-connection-card-${connection.id}`}
      data-provider={connection.provider}
      data-status={connection.displayStatus}
    >
      <div className="calendar-connection-card-header">
        <h3 className="calendar-connection-card-title">
          <span data-testid={`calendar-connection-card-name-${connection.id}`}>
            {providerLabel}
          </span>
          {connection.accountIdentifier ? (
            <span
              className="calendar-connection-card-account"
              data-testid={`calendar-connection-card-account-${connection.id}`}
            >
              {connection.accountIdentifier}
            </span>
          ) : null}
        </h3>
        <span
          className={`calendar-connection-status-pill calendar-connection-status-pill--${connection.displayStatus}`}
          aria-label={`Status: ${statusLabel}`}
          data-testid={statusToDataTestId(connection.displayStatus)}
          data-testid-detail={connection.id}
          data-status={connection.displayStatus}
        >
          {statusLabel}
        </span>
      </div>

      <p className="calendar-connection-last-sync">{lastSync}</p>

      {connection.displayStatus === "needs_reconnect" ||
      connection.displayStatus === "unsupported" ? (
        <form
          method="POST"
          action={`/me/calendar-connections/connect/${connection.provider}`}
          className="calendar-connection-reconnect-form"
          data-testid={`calendar-connection-reconnect-form-${connection.id}`}
        >
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="provider" value={connection.provider} />
          <button
            type="submit"
            className="btn btn-primary"
            data-testid={`calendar-connection-reconnect-${connection.id}`}
          >
            Reconnect
          </button>
        </form>
      ) : null}

      {showCalendars ? (
        <form
          method="POST"
          action={saveAction}
          className="calendar-connection-calendars-form"
          data-testid={`calendar-connection-calendars-form-${connection.id}`}
        >
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="connectionId" value={connection.id} />
          <fieldset
            className="calendar-connection-calendars-fieldset"
            disabled={!allowEdit}
            aria-describedby={
              connection.calendarsError
                ? `calendar-connection-calendars-error-${connection.id}`
                : undefined
            }
          >
            <legend className="calendar-connection-calendars-legend">
              Contributing calendars
            </legend>
            {connection.calendarsError ? (
              <p
                id={`calendar-connection-calendars-error-${connection.id}`}
                role="alert"
                aria-live="polite"
                className="calendar-connection-row-error"
                data-testid={`calendar-connection-calendars-error-${connection.id}`}
              >
                We could not list your calendars right now. Please refresh or
                reconnect.
              </p>
            ) : null}
            {connection.calendars.length === 0 ? (
              <p
                data-testid={`calendar-connection-calendars-empty-${connection.id}`}
              >
                No calendars available.
              </p>
            ) : (
              <ul
                className="calendar-connection-calendars-list"
                data-testid={`calendar-connection-calendars-list-${connection.id}`}
              >
                {connection.calendars.map((calendar) => (
                  <li
                    key={calendar.id}
                    className="calendar-connection-calendars-item"
                    data-testid={`calendar-connection-calendars-item-${connection.id}-${calendar.id}`}
                  >
                    <label htmlFor={`calendar-${connection.id}-${calendar.id}`}>
                      <input
                        id={`calendar-${connection.id}-${calendar.id}`}
                        type="checkbox"
                        name="calendarIds"
                        value={calendar.id}
                        defaultChecked={calendar.selected}
                        data-testid={`calendar-connection-calendars-checkbox-${connection.id}-${calendar.id}`}
                      />
                      <span>
                        {calendar.name}
                        {calendar.isPrimary ? " (primary)" : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <button
            type="submit"
            className="btn calendar-connection-save-button"
            data-testid={`calendar-connection-save-${connection.id}`}
            disabled={!allowEdit}
          >
            Save contributing calendars
          </button>
        </form>
      ) : null}

      {connection.displayStatus !== "needs_reconnect" &&
      connection.displayStatus !== "unsupported" ? (
        <div className="calendar-connection-card-actions">
          <form
            method="POST"
            action={refreshAction}
            className="calendar-connection-action-form"
            data-testid={`calendar-connection-refresh-form-${connection.id}`}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="connectionId" value={connection.id} />
            <button
              type="submit"
              className="btn calendar-connection-refresh-button"
              data-testid={`calendar-connection-refresh-${connection.id}`}
            >
              Refresh now
            </button>
          </form>
          <form
            method="POST"
            action={disconnectAction}
            className="calendar-connection-action-form"
            data-testid={`calendar-connection-disconnect-form-${connection.id}`}
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="connectionId" value={connection.id} />
            <label
              htmlFor={`calendar-connection-disconnect-confirm-${connection.id}`}
              className="calendar-connection-disconnect-confirm-label"
            >
              <span className="calendar-connection-disconfirm-prompt">
                Type the account identifier to disconnect
              </span>
              <input
                id={`calendar-connection-disconnect-confirm-${connection.id}`}
                type="text"
                name="confirmAccountIdentifier"
                className="calendar-connection-disconnect-confirm-input"
                data-testid={`calendar-connection-disconnect-confirm-${connection.id}`}
                required
                aria-describedby={`calendar-connection-disconnect-hint-${connection.id}`}
              />
              <span
                id={`calendar-connection-disconnect-hint-${connection.id}`}
                className="calendar-connection-disconnect-hint"
              >
                {connection.accountIdentifier ?? "(no account on file)"}
              </span>
            </label>
            <button
              type="submit"
              className="btn btn-danger calendar-connection-disconnect-button"
              data-testid={`calendar-connection-disconnect-${connection.id}`}
            >
              Disconnect
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
