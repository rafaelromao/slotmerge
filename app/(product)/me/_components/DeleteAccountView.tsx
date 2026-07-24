import Link from "next/link";

import {
  DeleteAccountConfirm,
  type DeleteAccountConfirmationError,
} from "./DeleteAccountConfirm";

export type DeleteAccountPageError = DeleteAccountConfirmationError | "csrf";

export const DELETE_ACCOUNT_BODY =
  "This removes your display name, profile, Topics, Availability, Discoverability, and Calendar Connections. You will not appear in Organizer Searches. Audit records that are not personal are kept. To delete, type `DELETE` below.";

export function DeleteAccountView({
  csrfToken,
  error,
}: {
  csrfToken: string;
  error?: DeleteAccountPageError;
}) {
  const confirmationError = error === "csrf" ? undefined : error;

  return (
    <main className="app-container delete-account-page">
      <h1>Delete your account</h1>
      <p className="delete-account-warning">{DELETE_ACCOUNT_BODY}</p>
      {error === "csrf" ? (
        <section
          className="sign-in-error delete-account-banner"
          role="alert"
          aria-live="polite"
          data-testid="delete-account-csrf-error"
        >
          Your request could not be verified. Refresh the page and try again.
        </section>
      ) : null}
      <DeleteAccountConfirm csrfToken={csrfToken} error={confirmationError} />
      <Link href="/me" className="btn btn-secondary">
        Cancel
      </Link>
    </main>
  );
}
