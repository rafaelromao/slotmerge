import Link from "next/link";

import {
  DeleteAccountConfirm,
  type DeleteAccountConfirmationError,
} from "./DeleteAccountConfirm";

export type DeleteAccountPageError = DeleteAccountConfirmationError | "csrf";

export const DELETE_ACCOUNT_BODY =
  "This removes your display name, profile, Topics, Availability, Discoverability, and Calendar Connections. You will not appear in Organizer Searches. Audit records that are not personal are kept. To delete, type DELETE below.";

export function DeleteAccountView({
  csrfToken,
  error,
}: {
  csrfToken: string;
  error?: DeleteAccountPageError;
}) {
  const confirmationError = error === "csrf" ? undefined : error;

  return (
    <main className="app-container me-page delete-account-page">
      <header className="page-header">
        <div className="page-header-copy">
          <p className="eyebrow">Account</p>
          <h1>Delete your account</h1>
          <p className="page-description">{DELETE_ACCOUNT_BODY}</p>
        </div>
        <div className="page-header-actions">
          <Link href="/me" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </header>

      {error === "csrf" ? (
        <p
          className="form-error-banner"
          role="alert"
          aria-live="polite"
          data-testid="delete-account-csrf-error"
        >
          Your request could not be verified. Refresh the page and try again.
        </p>
      ) : null}

      <section
        className="surface-section"
        aria-labelledby="delete-account-confirm-heading"
      >
        <div className="surface-section-header">
          <h2 id="delete-account-confirm-heading">Confirm deletion</h2>
          <p>Type DELETE exactly to confirm.</p>
        </div>
        <DeleteAccountConfirm csrfToken={csrfToken} error={confirmationError} />
      </section>
    </main>
  );
}
