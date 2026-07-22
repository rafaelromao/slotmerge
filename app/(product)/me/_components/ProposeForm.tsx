"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  proposeTopicAction,
  type ProposeActionStateLazy,
} from "../_actions/topics";

type ProposeFormProps = {
  csrfToken: string;
};

const IDLE_STATE: ProposeActionStateLazy = { ok: "idle" };

export function ProposeForm({ csrfToken }: ProposeFormProps) {
  const [state, formAction] = useActionState<ProposeActionStateLazy, FormData>(
    proposeTopicAction,
    IDLE_STATE,
  );

  const errorField = state.ok === "error" ? state.fieldError : null;
  const submittedName =
    state.ok === "success" || state.ok === "error"
      ? state.values.candidateName
      : "";

  return (
    <form
      action={formAction}
      className="topics-propose-form"
      data-testid="topics-propose-form"
      noValidate
    >
      <input type="hidden" name="_csrf" value={csrfToken} />

      <div className="topics-propose-row">
        <label htmlFor="topics-propose-input">Propose a new Topic</label>
        <div className="topics-propose-input">
          <input
            id="topics-propose-input"
            name="candidateName"
            type="text"
            maxLength={60}
            defaultValue={submittedName}
            aria-invalid={errorField ? "true" : "false"}
            aria-describedby={
              errorField ? "topics-propose-error" : "topics-propose-hint"
            }
            placeholder="e.g. Sailing"
            data-testid="topics-propose-input"
            required
          />
          {errorField ? (
            <p
              id="topics-propose-error"
              className="topics-propose-error"
              role="alert"
              aria-live="polite"
              data-testid="topics-propose-error"
            >
              {errorField}
            </p>
          ) : (
            <p
              id="topics-propose-hint"
              className="topics-propose-hint"
              data-testid="topics-propose-hint"
            >
              2 to 60 characters after trim. Proposals are reviewed by Admins.
            </p>
          )}
        </div>
      </div>

      <div className="topics-propose-actions">
        <ProposeSubmitButton />
      </div>

      {state.ok === "success" ? (
        <p
          className="topics-propose-success"
          role="status"
          aria-live="polite"
          data-testid="topics-propose-success"
        >
          Proposal submitted. Admins will review it shortly.
        </p>
      ) : null}
    </form>
  );
}

function ProposeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      data-testid="topics-propose-submit"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Submitting…" : "Submit proposal"}
    </button>
  );
}
