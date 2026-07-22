import type { DiscoverabilityConsentRecord } from "../../../../src/profile/discoverability-consent";

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
  errorCode?:
    | "consent_required"
    | "consent_already_granted"
    | "consent_already_revoked"
    | "invalid_submission";
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
  code: DiscoverabilityViewProps["errorCode"] | undefined,
  field: "confirmed" | "form",
): string | null {
  if (!code) {
    return null;
  }
  if (field === "confirmed" && code === "consent_required") {
    return "Please tick the consent checkbox before saving.";
  }
  if (field === "form" && code === "consent_already_granted") {
    return "Consent is already granted. Use Revoke to change it.";
  }
  if (field === "form" && code === "consent_already_revoked") {
    return "Consent is already revoked. Tick the checkbox to re-grant.";
  }
  if (field === "form" && code === "invalid_submission") {
    return "Please check your selection and try again.";
  }
  return null;
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
    <main className="app-container" data-state={view.state}>
      <h1 data-testid="discoverability-heading">Discoverability consent</h1>

      <section
        className="discoverability-section"
        aria-labelledby="discoverability-visible-heading"
      >
        <h2 id="discoverability-visible-heading">What Organizers may see</h2>
        <ul
          className="discoverability-list"
          data-testid="discoverability-visible"
        >
          {CONSENT_BULLETS_VISIBLE.map((item) => (
            <li key={item.label}>{item.label}</li>
          ))}
        </ul>
      </section>

      <section
        className="discoverability-section"
        aria-labelledby="discoverability-hidden-heading"
      >
        <h2 id="discoverability-hidden-heading">
          What Organizers will not see
        </h2>
        <ul
          className="discoverability-list"
          data-testid="discoverability-hidden"
        >
          {CONSENT_BULLETS_HIDDEN.map((item) => (
            <li key={item.label}>{item.label}</li>
          ))}
        </ul>
      </section>

      {view.state === "granted" ? (
        <section
          className="discoverability-summary"
          data-testid="discoverability-granted"
        >
          <p>
            Consent granted on{" "}
            <time
              dateTime={view.grantedAt.toISOString()}
              data-testid="discoverability-granted-date"
            >
              {formatConsentDate(view.grantedAt)}
            </time>
            .
          </p>
          <form
            method="POST"
            action={setDiscoverabilityAction}
            className="discoverability-revoke-form"
            data-testid="discoverability-revoke-form"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="granted" value="false" />
            <button
              type="submit"
              className="btn btn-secondary"
              data-testid="discoverability-revoke"
            >
              Revoke
            </button>
          </form>
        </section>
      ) : (
        <section
          className="discoverability-form"
          data-testid="discoverability-form"
        >
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
              .
            </p>
          ) : null}
          {formError ? (
            <p
              className="sign-in-error"
              role="alert"
              aria-live="polite"
              data-testid="discoverability-form-error"
            >
              {formError}
            </p>
          ) : null}
          <form
            method="POST"
            action={setDiscoverabilityAction}
            className="discoverability-consent-form"
            data-testid="discoverability-consent-form"
          >
            <input type="hidden" name="_csrf" value={csrfToken} />
            <input type="hidden" name="granted" value="true" />
            <label className="discoverability-consent-label">
              <input
                type="checkbox"
                name="confirmed"
                value="on"
                className="discoverability-consent-checkbox"
                data-testid="discoverability-consent-checkbox"
              />
              I understand and consent to the Organizer-visible fields above.
            </label>
            {confirmedError ? (
              <p
                className="sign-in-error"
                role="alert"
                aria-live="polite"
                data-testid="discoverability-consent-error"
              >
                {confirmedError}
              </p>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="discoverability-save"
            >
              Save
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
