"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  handleUpdateProfileFormSubmit,
  type UpdateProfileActionState,
} from "../_actions/update-profile";

type ProfileFormProps = {
  defaultValues: {
    displayName: string;
    email: string;
    profileTimezone: string;
    bufferMinutes: number;
    avatarUrl: string;
    shortBio: string;
  };
  csrfToken: string;
  supportedTimeZones: ReadonlyArray<string>;
};

const IDLE_STATE: UpdateProfileActionState = { ok: "idle" };

function timezoneLabel(zone: string): string {
  return zone;
}

export function ProfileForm({
  defaultValues,
  csrfToken,
  supportedTimeZones,
}: ProfileFormProps) {
  const [state, formAction] = useActionState<
    UpdateProfileActionState,
    FormData
  >(handleUpdateProfileFormSubmit, IDLE_STATE);

  const initialDisplayName =
    state.values?.displayName ?? defaultValues.displayName;
  const initialTimezone =
    state.values?.profileTimezone ?? defaultValues.profileTimezone;
  const initialBuffer =
    state.values?.bufferMinutes ?? String(defaultValues.bufferMinutes);
  const initialAvatarUrl = state.values?.avatarUrl ?? defaultValues.avatarUrl;
  const initialShortBio = state.values?.shortBio ?? defaultValues.shortBio;

  const [bufferRaw, setBufferRaw] = useState(initialBuffer);

  const fieldErrors = state.ok === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form
      action={formAction}
      className="profile-form"
      data-testid="profile-form"
      noValidate
    >
      <input type="hidden" name="_csrf" value={csrfToken} />

      <div className="profile-form-row">
        <label htmlFor="profile-display-name">Display name</label>
        <div className="profile-input">
          <input
            id="profile-display-name"
            name="displayName"
            type="text"
            defaultValue={initialDisplayName}
            maxLength={120}
            aria-invalid={fieldErrors.displayName ? "true" : "false"}
            aria-describedby={
              fieldErrors.displayName
                ? "profile-display-name-error"
                : "profile-display-name-hint"
            }
            data-testid="profile-display-name-input"
            required
          />
          {fieldErrors.displayName ? (
            <p
              id="profile-display-name-error"
              className="profile-form-error"
              role="alert"
              aria-live="polite"
              data-testid="profile-display-name-error"
            >
              {fieldErrors.displayName}
            </p>
          ) : (
            <p
              id="profile-display-name-hint"
              className="profile-form-hint"
              data-testid="profile-display-name-hint"
            >
              Required. 1 to 80 characters after trim.
            </p>
          )}
        </div>
      </div>

      <div className="profile-form-row">
        <label htmlFor="profile-email">Email</label>
        <div className="profile-input">
          <input
            id="profile-email"
            name="email"
            type="email"
            defaultValue={defaultValues.email}
            readOnly
            aria-readonly="true"
            data-testid="profile-email-input"
          />
          <p className="profile-form-hint">
            Email is set by the sign-in you accepted.
          </p>
        </div>
      </div>

      <div className="profile-form-row">
        <label htmlFor="profile-timezone">Timezone</label>
        <div className="profile-input">
          <select
            id="profile-timezone"
            name="profileTimezone"
            defaultValue={initialTimezone}
            aria-invalid={fieldErrors.profileTimezone ? "true" : "false"}
            aria-describedby={
              fieldErrors.profileTimezone
                ? "profile-timezone-error"
                : "profile-timezone-hint"
            }
            data-testid="profile-timezone-select"
            required
          >
            <option value="" disabled>
              Select a timezone
            </option>
            {supportedTimeZones.map((zone) => (
              <option key={zone} value={zone}>
                {timezoneLabel(zone)}
              </option>
            ))}
          </select>
          {fieldErrors.profileTimezone ? (
            <p
              id="profile-timezone-error"
              className="profile-form-error"
              role="alert"
              aria-live="polite"
              data-testid="profile-timezone-error"
            >
              {fieldErrors.profileTimezone}
            </p>
          ) : (
            <p
              id="profile-timezone-hint"
              className="profile-form-hint"
              data-testid="profile-timezone-hint"
            >
              Required. Must be a supported IANA timezone.
            </p>
          )}
        </div>
      </div>

      <div className="profile-form-row">
        <label htmlFor="profile-buffer">Buffer minutes</label>
        <div className="profile-input">
          <input
            id="profile-buffer"
            name="bufferMinutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            step={1}
            value={bufferRaw}
            onChange={(event) => setBufferRaw(event.target.value)}
            aria-invalid={fieldErrors.bufferMinutes ? "true" : "false"}
            aria-describedby={
              fieldErrors.bufferMinutes
                ? "profile-buffer-error"
                : "profile-buffer-hint"
            }
            data-testid="profile-buffer-input"
            required
          />
          {fieldErrors.bufferMinutes ? (
            <p
              id="profile-buffer-error"
              className="profile-form-error"
              role="alert"
              aria-live="polite"
              data-testid="profile-buffer-error"
            >
              {fieldErrors.bufferMinutes}
            </p>
          ) : (
            <p
              id="profile-buffer-hint"
              className="profile-form-hint"
              data-testid="profile-buffer-hint"
            >
              Whole number between 0 and 60.
            </p>
          )}
        </div>
      </div>

      <div className="profile-form-row">
        <label htmlFor="profile-avatar">Avatar URL</label>
        <div className="profile-input">
          <input
            id="profile-avatar"
            name="avatarUrl"
            type="url"
            defaultValue={initialAvatarUrl}
            aria-invalid={fieldErrors.avatarUrl ? "true" : "false"}
            aria-describedby={
              fieldErrors.avatarUrl
                ? "profile-avatar-error"
                : "profile-avatar-hint"
            }
            data-testid="profile-avatar-input"
          />
          {fieldErrors.avatarUrl ? (
            <p
              id="profile-avatar-error"
              className="profile-form-error"
              role="alert"
              aria-live="polite"
              data-testid="profile-avatar-error"
            >
              {fieldErrors.avatarUrl}
            </p>
          ) : (
            <p
              id="profile-avatar-hint"
              className="profile-form-hint"
              data-testid="profile-avatar-hint"
            >
              Optional. Must start with https://.
            </p>
          )}
        </div>
      </div>

      <div className="profile-form-row">
        <label htmlFor="profile-bio">Short bio</label>
        <div className="profile-input">
          <textarea
            id="profile-bio"
            name="shortBio"
            defaultValue={initialShortBio}
            maxLength={400}
            rows={3}
            aria-invalid={fieldErrors.shortBio ? "true" : "false"}
            aria-describedby={
              fieldErrors.shortBio ? "profile-bio-error" : "profile-bio-hint"
            }
            data-testid="profile-bio-input"
          />
          {fieldErrors.shortBio ? (
            <p
              id="profile-bio-error"
              className="profile-form-error"
              role="alert"
              aria-live="polite"
              data-testid="profile-bio-error"
            >
              {fieldErrors.shortBio}
            </p>
          ) : (
            <p
              id="profile-bio-hint"
              className="profile-form-hint"
              data-testid="profile-bio-hint"
            >
              Optional. Up to 280 characters.
            </p>
          )}
        </div>
      </div>

      <div className="profile-form-actions">
        <SaveButton />
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      data-testid="profile-save-button"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
