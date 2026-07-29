"use client";

import { useState } from "react";
import { retireTopicAction } from "../_actions/topics";

type Props = {
  topicId: string;
  topicName: string;
  csrfToken: string;
  disabledBySelfAction?: boolean;
  action?: (formData: FormData) => Promise<void>;
};

export function RetireTypedConfirm({
  topicId,
  topicName,
  csrfToken,
  disabledBySelfAction = false,
  action = retireTopicAction,
}: Props) {
  const [typedName, setTypedName] = useState("");
  const normalizedTyped = typedName.trim().toLowerCase();
  const normalizedName = topicName.trim().toLowerCase();
  const matches = normalizedTyped === normalizedName;
  const helpId = `topics-self-action-help-${topicId}`;
  return (
    <form
      action={action}
      className="suspend-typed-confirm topics-retire-form"
      data-testid={`topics-retire-form-${topicId}`}
      data-disabled-by-self-action={disabledBySelfAction ? "true" : "false"}
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <input type="hidden" name="topicId" value={topicId} />
      <label
        htmlFor={`topics-retire-input-${topicId}`}
        className="topics-retire-label"
      >
        Type <code>{topicName}</code> to confirm
      </label>
      <input
        id={`topics-retire-input-${topicId}`}
        name="confirmName"
        value={typedName}
        onChange={(event) => setTypedName(event.target.value)}
        disabled={disabledBySelfAction}
        data-testid={`topics-retire-input-${topicId}`}
        aria-describedby={disabledBySelfAction ? helpId : undefined}
        autoComplete="off"
        className="topics-retire-input"
      />
      <button
        type="submit"
        disabled={disabledBySelfAction || !matches}
        title={
          disabledBySelfAction
            ? "You cannot retire a Topic you proposed."
            : undefined
        }
        aria-describedby={disabledBySelfAction ? helpId : undefined}
        data-testid={`topics-retire-button-${topicId}`}
      >
        Retire
      </button>
      {disabledBySelfAction ? (
        <span
          id={helpId}
          role="note"
          className="topics-self-action-help"
          data-testid={helpId}
        >
          You cannot retire a Topic you proposed.
        </span>
      ) : null}
    </form>
  );
}
