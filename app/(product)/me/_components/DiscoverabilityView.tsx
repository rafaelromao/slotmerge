import type { DiscoverabilityConsentRecord } from "../../../../src/profile/discoverability-consent";
import {
  buildFieldErrors,
  type SetDiscoverabilityFormErrorCode,
} from "../_actions/set-discoverability-handler";

type ConsentView =
  | { state: "initial" }
  | { state: "granted"; grantedAt: Date }
  | { state: "revoked"; revokedAt: Date };

export function toConsentView(
  consent: DiscoverabilityConsentRecord | null,
): ConsentView {
  if (!consent) {
    return { state: "initial" };
  }
  if (consent.state === "granted") {
    return { state: "granted", grantedAt: consent.grantedAt };
  }
  return { state: "revoked", revokedAt: consent.revokedAt };
}

export function formatConsentDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type DiscoverabilityViewProps = {
  view: ConsentView;
  csrfToken: string;
  errorCode?: SetDiscoverabilityFormErrorCode;
  setDiscoverabilityAction: (formData: FormData) => Promise<void>;
};

const CONSENT_BULLETS_VISIBLE: ReadonlyArray<{ label: string }> = [
  { label: "Display name" },
  { label: "Avatar" },
  { label: "Short bio" },
  { label: "Full Topic profile" },
  { label: "Topic-filtered Availability" },
];

const CONSENT_BULLETS_HIDDEN: ReadonlyArray<{ label: string }> = [
  { label: "Raw calendar events" },
  { label: "Calendar titles" },
  { label: "Attendees" },
  { label: "Locations" },
  { label: "Descriptions" },
  { label: "Email address" },
];

function fieldErrorMessageFor(
  code: SetDiscoverabilityFormErrorCode | undefined,
  field: "confirmed" | "form",
): string | null {
  if (!code) {
    return null;
  }
  const fieldErrors = buildFieldErrors(code);
  return fieldErrors[field] ?? null;
}

export function DiscoverabilityView({
  view,
  csrfToken,
  errorCode,
  setDiscoverabilityAction,
}: DiscoverabilityViewProps) {
  const confirmedError = fieldErrorMessageFor(errorCode, "confirmed");
  const formError = fieldErrorMessageFor(errorCode, "form");

  return (
    <main
      className="app-container me-page discoverability-page"
      data-state={view.state}
      data-testid="discoverability-page"
    >
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Consent</p>
          <h1 data-testid="discoverability-heading">Discoverability</h1>
          <p className="page-description">
            Choose whether Organizers can include you in their Searches. Only
            the fields below are ever shared, and only when you are in a
            matching Slot.
          </p>
        </div>
        <div className="page-header-actions">
          <span
            className="me-page-header-pill"
            data-tone={
              view.state === "granted"
                ? "ok"
                : view.state === "revoked"
                  ? "danger"
                  : "warn"
            }
            data-testid="discoverability-status-pill"
          >
            <strong>
              {view.state === "granted"
                ? "Consent granted"
                : view.state === "revoked"
                  ? "Consent revoked"
                  : "Not decided"}
            </strong>
            <span>
              {view.state === "granted"
                ? "You appear in matching Searches"
                : view.state === "revoked"
                  ? "You are hidden from Searches"
                  : "Choose to opt in or stay hidden"}
            </span>
          </span>
        </div>
      </header>

      <div className="discoverability-grid">
        <section
          className="surface-section"
          aria-labelledby="discoverability-visible-heading"
        >
          <div className="surface-section-header">
            <h2 id="discoverability-visible-heading">
              What Organizers may see
            </h2>
            <p>Shared only when you are in a matching Slot.</p>
          </div>
          <ul
            className="data-table-actions discoverability-list"
            data-testid="discoverability-visible"
          >
            {CONSENT_BULLETS_VISIBLE.map((item) => (
              <li key={item.label}>{item.label}</li>
            ))}
          </ul>
        </section>

        <section
          className="surface-section discoverability-section--hidden"
          aria-labelledby="discoverability-hidden-heading"
        >
          <div className="surface-section-header">
            <h2 id="discoverability-hidden-heading">
              What Organizers will not see
            </h2>
            <p>Always private, even when you opt in.</p>
          </div>
          <ul
            className="discoverability-list"
            data-testid="discoverability-hidden"
          >
            {CONSENT_BULLETS_HIDDEN.map((item) => (
              <li key={item.label}>{item.label}</li>
            ))}
          </ul>
        </section>
      </div>

      {view.state === "granted" ? (
        <section
          className="surface-section"
          data-testid="discoverability-granted"
        >
          <div className="surface-section-header">
            <h2>Consent on file</h2>
            <p>
              Granted on{" "}
              <time
                dateTime={view.grantedAt.toISOString()}
                data-testid="discoverability-granted-date"
              >
                {formatConsentDate(view.grantedAt)}
              </time>
              .
            </p>
          </div>
          <form
            method="POST"
            action={setDiscoverabilityAction}
            className="form-actions"
            data-testid="discoverability-revoke-form"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="granted" value="false" />
            <button
              type="submit"
              className="btn btn-secondary"
              data-testid="discoverability-revoke"
            >
              Revoke consent
            </button>
          </form>
        </section>
      ) : (
        <section className="surface-section" data-testid="discoverability-form">
          <div className="surface-section-header">
            <h2>Save consent</h2>
            {view.state === "revoked" ? (
              <p
                className="discoverability-revoked-note"
                data-testid="discoverability-revoked-note"
              >
                Consent revoked on{" "}
                <time
                  dateTime={view.revokedAt.toISOString()}
                  data-testid="discoverability-revoked-date"
                >
                  {formatConsentDate(view.revokedAt)}
                </time>
                . You can grant consent again at any time.
              </p>
            ) : null}
            {formError ? (
              <p
                className="form-field-error"
                role="alert"
                aria-live="polite"
                data-testid="discoverability-form-error"
              >
                {formError}
              </p>
            ) : null}
          </div>
          <form
            method="POST"
            action={setDiscoverabilityAction}
            data-testid="discoverability-consent-form"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="granted" value="true" />
            <label className="checkbox-row">
              <input
                type="checkbox"
                name="confirmed"
                value="on"
                data-testid="discoverability-consent-checkbox"
              />
              <span className="checkbox-row-label">
                <span className="checkbox-row-label-main">
                  I understand and consent to the Organizer-visible fields
                  above.
                </span>
              </span>
            </label>
            {confirmedError ? (
              <p
                className="form-field-error"
                role="alert"
                aria-live="polite"
                data-testid="discoverability-consent-error"
              >
                {confirmedError}
              </p>
            ) : null}
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="discoverability-save"
              >
                Save consent
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
