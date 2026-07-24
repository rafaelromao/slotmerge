"use client";

import { useState } from "react";

export type DeleteAccountConfirmationError =
  "confirm_required" | "confirm_mismatch";

export function DeleteAccountConfirm({
  csrfToken,
  error,
}: {
  csrfToken: string;
  error?: DeleteAccountConfirmationError;
}) {
  const [confirmation, setConfirmation] = useState("");
  const matches = confirmation === "DELETE";
  const errorMessage =
    error === "confirm_required"
      ? "Type DELETE to confirm account deletion."
      : error === "confirm_mismatch"
        ? "The confirmation must match DELETE exactly."
        : null;

  return (
    <form
      action="/me/delete/submit"
      method="POST"
      className="delete-account-form"
      data-testid="delete-account-form"
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <label htmlFor="delete-account-confirmation">
        Type DELETE to confirm
      </label>
      <input
        id="delete-account-confirmation"
        name="confirmation"
        type="text"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={
          errorMessage
            ? "delete-account-confirmation-error"
            : "delete-account-confirmation-help"
        }
        data-testid="delete-account-confirmation"
      />
      <span id="delete-account-confirmation-help" className="sr-only">
        Enter the uppercase word DELETE without spaces.
      </span>
      {errorMessage ? (
        <p
          id="delete-account-confirmation-error"
          className="sign-in-error"
          role="alert"
          aria-live="polite"
          data-testid="delete-account-confirmation-error"
        >
          {errorMessage}
        </p>
      ) : null}
      <button
        type="submit"
        className="btn btn-danger"
        disabled={!matches}
        data-testid="delete-account-submit"
      >
        Delete my account
      </button>
    </form>
  );
}
