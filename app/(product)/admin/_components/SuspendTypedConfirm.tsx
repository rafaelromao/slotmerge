"use client";

import { useId, useState } from "react";

type SuspendTypedConfirmProps = {
  userId: string;
  userEmail: string;
  csrfToken: string;
  action: (formData: FormData) => Promise<void>;
};

export function SuspendTypedConfirm({
  userId,
  userEmail,
  csrfToken,
  action,
}: SuspendTypedConfirmProps) {
  const [typedEmail, setTypedEmail] = useState("");
  const helpId = useId();
  const matches = typedEmail.trim().toLowerCase() === userEmail.toLowerCase();
  const disabled = !matches;

  return (
    <form
      className="suspend-typed-confirm"
      data-testid={`suspend-typed-confirm-${userId}`}
      action={action}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="userId" value={userId} />
      <label
        className="suspend-typed-confirm-label"
        htmlFor={`suspend-confirm-${userId}`}
      >
        Type <code>{userEmail}</code> to confirm
      </label>
      <input
        id={`suspend-confirm-${userId}`}
        name="confirmEmail"
        type="email"
        autoComplete="off"
        className="suspend-typed-confirm-input"
        data-testid={`suspend-confirm-input-${userId}`}
        value={typedEmail}
        onChange={(e) => setTypedEmail(e.target.value)}
        aria-describedby={helpId}
      />
      <span id={helpId} className="visually-hidden">
        Suspending a user revokes their active sessions.
      </span>
      <button
        type="submit"
        className="btn btn-danger suspend-typed-confirm-button"
        data-testid={`suspend-confirm-button-${userId}`}
        disabled={disabled}
      >
        Suspend
      </button>
    </form>
  );
}
