import type {
  AvailabilityActionResult,
} from "../_actions/availability-handler";
import { formatAvailabilityError } from "../_actions/availability-handler";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type AvailabilityViewWindow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AvailabilityViewOverride = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "add" | "block";
};

export type AvailabilityViewPreviewLine = {
  date: string;
  dayOfWeek: number;
  intervals: string[];
};

export type AvailabilityViewProps = {
  csrfToken: string;
  profileTimezone: string | null;
  bufferMinutes: number;
  bufferIsInvalid: boolean;
  timezoneRequired: boolean;
  saved: boolean;
  windowsByDay: Record<number, AvailabilityViewWindow[]>;
  overrides: AvailabilityViewOverride[];
  previewLines: AvailabilityViewPreviewLine[];
  errorCode: string | null;
  errorField: string | null;
  errorTarget: string | null;
  bufferError: string | null;
  addWindowAction: (formData: FormData) => Promise<never>;
  removeWindowAction: (formData: FormData) => Promise<never>;
  addOverrideAction: (formData: FormData) => Promise<never>;
  removeOverrideAction: (formData: FormData) => Promise<never>;
};

function isWindowErrorTarget(
  errorTarget: string | null,
  source: string | null,
): boolean {
  return errorTarget === "window" && (source === null || source === "window");
}

function isOverrideErrorTarget(
  errorTarget: string | null,
  source: string | null,
): boolean {
  return (
    errorTarget === "override" && (source === null || source === "override")
  );
}

function errorForField(
  field: string,
  errorCode: string | null,
  errorField: string | null,
  errorTarget: string | null,
): string | null {
  if (!errorCode || !errorField) return null;
  if (field !== errorField) return null;
  return formatAvailabilityError(
    errorCode as never,
    errorField as never,
  );
}

export function AvailabilityView(props: AvailabilityViewProps) {
  const {
    csrfToken,
    profileTimezone,
    bufferMinutes,
    bufferIsInvalid,
    timezoneRequired,
    saved,
    windowsByDay,
    overrides,
    previewLines,
    errorCode,
    errorField,
    errorTarget,
    bufferError,
    addWindowAction,
    removeWindowAction,
    addOverrideAction,
    removeOverrideAction,
  } = props;

  const hasAnyAvailability =
    Object.values(windowsByDay).some((list) => list.length > 0) ||
    overrides.length > 0;

  const pageErrorCode =
    errorCode && errorTarget === "page" ? errorCode : null;

  return (
    <main className="app-container" data-testid="availability-page">
      <h1 data-testid="availability-page-heading">Availability</h1>
      <p className="availability-page-intro">
        Define when you are available. Weekly windows apply to every week; one-off
        overrides add or block specific dates.
      </p>

      {saved ? (
        <p
          className="availability-saved-indicator"
          role="status"
          aria-live="polite"
          data-testid="availability-saved-indicator"
        >
          Saved
        </p>
      ) : null}

      <section
        className="availability-section"
        aria-labelledby="availability-timezone-heading"
        data-testid="availability-timezone-section"
      >
        <h2 id="availability-timezone-heading">Profile timezone</h2>
        {timezoneRequired ? (
          <div
            className="availability-timezone-required"
            data-testid="availability-timezone-required"
          >
            <p
              role="alert"
              aria-live="polite"
              data-testid="availability-timezone-required-error"
            >
              {formatAvailabilityError(
                "profile_timezone_required",
                "profileTimezone",
              )}
            </p>
            <a
              href="/me/profile"
              className="btn btn-primary"
              data-testid="availability-set-timezone-link"
            >
              Set timezone
            </a>
          </div>
        ) : (
          <p
            className="availability-timezone-summary"
            data-testid="availability-timezone-summary"
          >
            Timezone: <strong>{profileTimezone}</strong>.{" "}
            <a
              href="/me/profile"
              className="availability-inline-link"
              data-testid="availability-edit-timezone-link"
            >
              Change in profile
            </a>
            .
          </p>
        )}
      </section>

      {timezoneRequired ? null : (
        <>
          <section
            className="availability-section"
            aria-labelledby="availability-weekly-heading"
            data-testid="availability-weekly-section"
          >
            <h2 id="availability-weekly-heading">Weekly Availability</h2>
            <div
              className="availability-weekly-grid"
              data-testid="availability-weekly-grid"
            >
              {DAY_LABELS.map((day, dayIndex) => {
                const dayWindows = windowsByDay[dayIndex] ?? [];
                const dayFieldError = errorForField(
                  "dayOfWeek",
                  errorCode,
                  errorField,
                  errorTarget,
                );
                const startFieldError = errorForField(
                  "startTime",
                  errorCode,
                  errorField,
                  errorTarget,
                );
                const endFieldError = errorForField(
                  "endTime",
                  errorCode,
                  errorField,
                  errorTarget,
                );
                const showDayError =
                  isWindowErrorTarget(errorTarget, null) &&
                  (dayFieldError !== null ||
                    startFieldError !== null ||
                    endFieldError !== null);
                return (
                  <div
                    key={day}
                    className="availability-day-card"
                    data-testid={`availability-day-${dayIndex}`}
                    data-day={dayIndex}
                  >
                    <h3
                      className="availability-day-heading"
                      id={`availability-day-${dayIndex}-heading`}
                    >
                      {day}
                    </h3>
                    {dayWindows.length === 0 ? (
                      <p
                        className="availability-day-empty"
                        data-testid={`availability-day-${dayIndex}-empty`}
                      >
                        No windows
                      </p>
                    ) : (
                      <ul
                        className="availability-window-list"
                        data-testid={`availability-day-${dayIndex}-windows`}
                      >
                        {dayWindows.map((window) => (
                          <li
                            key={window.id}
                            className="availability-window-row"
                            data-testid={`availability-window-${window.id}`}
                            data-window-id={window.id}
                          >
                            <span className="availability-window-range">
                              {window.startTime}–{window.endTime}
                            </span>
                            <form
                              method="POST"
                              action={removeWindowAction}
                              className="availability-window-remove-form"
                              data-testid={`availability-window-${window.id}-remove-form`}
                            >
                              <input
                                type="hidden"
                                name="_csrf"
                                value={csrfToken}
                              />
                              <input
                                type="hidden"
                                name="windowId"
                                value={window.id}
                              />
                              <button
                                type="submit"
                                className="btn btn-secondary"
                                data-testid={`availability-window-${window.id}-remove`}
                              >
                                Remove
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form
                      method="POST"
                      action={addWindowAction}
                      className="availability-day-add-form"
                      data-testid={`availability-day-${dayIndex}-add-form`}
                    >
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <input
                        type="hidden"
                        name="dayOfWeek"
                        value={dayIndex}
                      />
                      <input
                        type="hidden"
                        name="profileTimezone"
                        value={profileTimezone ?? ""}
                      />
                      <label
                        htmlFor={`availability-day-${dayIndex}-start`}
                        className="availability-day-add-label"
                      >
                        Start
                      </label>
                      <input
                        id={`availability-day-${dayIndex}-start`}
                        type="time"
                        name="startTime"
                        step={900}
                        defaultValue="09:00"
                        required
                        aria-invalid={showDayError && startFieldError ? "true" : "false"}
                        aria-describedby={
                          showDayError && startFieldError
                            ? `availability-day-${dayIndex}-error`
                            : undefined
                        }
                        data-testid={`availability-day-${dayIndex}-start`}
                      />
                      <label
                        htmlFor={`availability-day-${dayIndex}-end`}
                        className="availability-day-add-label"
                      >
                        End
                      </label>
                      <input
                        id={`availability-day-${dayIndex}-end`}
                        type="time"
                        name="endTime"
                        step={900}
                        defaultValue="12:00"
                        required
                        aria-invalid={showDayError && endFieldError ? "true" : "false"}
                        aria-describedby={
                          showDayError && endFieldError
                            ? `availability-day-${dayIndex}-error`
                            : undefined
                        }
                        data-testid={`availability-day-${dayIndex}-end`}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        data-testid={`availability-day-${dayIndex}-save`}
                      >
                        Save {day}
                      </button>
                    </form>
                    {showDayError ? (
                      <p
                        id={`availability-day-${dayIndex}-error`}
                        className="availability-form-error"
                        role="alert"
                        aria-live="polite"
                        data-testid={`availability-day-${dayIndex}-error`}
                      >
                        {dayFieldError ?? startFieldError ?? endFieldError}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section
            className="availability-section"
            aria-labelledby="availability-overrides-heading"
            data-testid="availability-overrides-section"
          >
            <h2 id="availability-overrides-heading">One-off overrides</h2>
            {overrides.length === 0 ? (
              <p
                className="availability-overrides-empty"
                data-testid="availability-overrides-empty"
              >
                No overrides yet.
              </p>
            ) : (
              <ul
                className="availability-overrides-list"
                data-testid="availability-overrides-list"
              >
                {overrides.map((override) => (
                  <li
                    key={override.id}
                    className={`availability-override-row availability-override-row--${override.type}`}
                    data-testid={`availability-override-${override.id}`}
                    data-override-id={override.id}
                    data-type={override.type}
                  >
                    <span className="availability-override-type">
                      {override.type}
                    </span>
                    <span className="availability-override-date">
                      {override.date}
                    </span>
                    <span className="availability-override-range">
                      {override.startTime}–{override.endTime}
                    </span>
                    <form
                      method="POST"
                      action={removeOverrideAction}
                      className="availability-override-remove-form"
                      data-testid={`availability-override-${override.id}-remove-form`}
                    >
                      <input type="hidden" name="_csrf" value={csrfToken} />
                      <input
                        type="hidden"
                        name="overrideId"
                        value={override.id}
                      />
                      <button
                        type="submit"
                        className="btn btn-secondary"
                        data-testid={`availability-override-${override.id}-remove`}
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <form
              method="POST"
              action={addOverrideAction}
              className="availability-override-add-form"
              data-testid="availability-override-add-form"
            >
              <input type="hidden" name="_csrf" value={csrfToken} />
              <input
                type="hidden"
                name="profileTimezone"
                value={profileTimezone ?? ""}
              />
              <div className="availability-override-add-row">
                <label
                  htmlFor="availability-override-date"
                  className="availability-override-add-label"
                >
                  Date
                </label>
                <input
                  id="availability-override-date"
                  type="date"
                  name="date"
                  required
                  aria-invalid={
                    isOverrideErrorTarget(errorTarget, null) &&
                    errorField === "date"
                      ? "true"
                      : "false"
                  }
                  aria-describedby={
                    isOverrideErrorTarget(errorTarget, null) &&
                    errorField === "date"
                      ? "availability-override-error"
                      : undefined
                  }
                  data-testid="availability-override-date-input"
                />
              </div>
              <div className="availability-override-add-row">
                <label
                  htmlFor="availability-override-start"
                  className="availability-override-add-label"
                >
                  Start
                </label>
                <input
                  id="availability-override-start"
                  type="time"
                  name="startTime"
                  step={900}
                  defaultValue="09:00"
                  required
                  aria-invalid={
                    isOverrideErrorTarget(errorTarget, null) &&
                    errorField === "startTime"
                      ? "true"
                      : "false"
                  }
                  aria-describedby={
                    isOverrideErrorTarget(errorTarget, null) &&
                    errorField === "startTime"
                      ? "availability-override-error"
                      : undefined
                  }
                  data-testid="availability-override-start-input"
                />
              </div>
              <div className="availability-override-add-row">
                <label
                  htmlFor="availability-override-end"
                  className="availability-override-add-label"
                >
                  End
                </label>
                <input
                  id="availability-override-end"
                  type="time"
                  name="endTime"
                  step={900}
                  defaultValue="10:00"
                  required
                  aria-invalid={
                    isOverrideErrorTarget(errorTarget, null) &&
                    errorField === "endTime"
                      ? "true"
                      : "false"
                  }
                  aria-describedby={
                    isOverrideErrorTarget(errorTarget, null) &&
                    errorField === "endTime"
                      ? "availability-override-error"
                      : undefined
                  }
                  data-testid="availability-override-end-input"
                />
              </div>
              <div className="availability-override-add-row">
                <span className="availability-override-add-label">Type</span>
                <label className="availability-override-type-label">
                  <input
                    type="radio"
                    name="type"
                    value="add"
                    defaultChecked
                    data-testid="availability-override-type-add"
                  />
                  Add
                </label>
                <label className="availability-override-type-label">
                  <input
                    type="radio"
                    name="type"
                    value="block"
                    data-testid="availability-override-type-block"
                  />
                  Block
                </label>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="availability-override-add-submit"
              >
                Add override
              </button>
            </form>
            {isOverrideErrorTarget(errorTarget, null) && errorCode && errorField ? (
              <p
                id="availability-override-error"
                className="availability-form-error"
                role="alert"
                aria-live="polite"
                data-testid="availability-override-error"
              >
                {formatAvailabilityError(
                  errorCode as never,
                  errorField as never,
                )}
              </p>
            ) : null}
          </section>

          <section
            className="availability-section"
            aria-labelledby="availability-buffer-heading"
            data-testid="availability-buffer-section"
          >
            <h2 id="availability-buffer-heading">Calendar conflict buffer</h2>
            {bufferError || bufferIsInvalid ? (
              <p
                className="availability-form-error"
                role="alert"
                aria-live="polite"
                data-testid="availability-buffer-error"
              >
                Buffer minutes must be a whole number between 0 and 60.{" "}
                <a
                  href="/me/profile"
                  className="availability-inline-link"
                  data-testid="availability-buffer-edit-link"
                >
                  Edit your profile
                </a>
                .
              </p>
            ) : (
              <p
                className="availability-buffer-summary"
                data-testid="availability-buffer-summary"
              >
                Calendar conflict buffer:{" "}
                <strong>{bufferMinutes} minutes</strong>.{" "}
                <a
                  href="/me/profile"
                  className="availability-inline-link"
                  data-testid="availability-buffer-edit-link"
                >
                  Change in profile
                </a>
                .
              </p>
            )}
          </section>

          <section
            className="availability-section"
            aria-labelledby="availability-preview-heading"
            data-testid="availability-preview-section"
          >
            <h2 id="availability-preview-heading">
              Effective Availability (next 7 days)
            </h2>
            {previewLines.length === 0 ? (
              <p
                className="availability-preview-empty"
                data-testid="availability-preview-empty"
              >
                No availability yet.
              </p>
            ) : (
              <pre
                className="availability-preview"
                data-testid="availability-preview"
              >
                {previewLines
                  .map(
                    (line) =>
                      `${DAY_LABELS[line.dayOfWeek] ?? "?"} ${line.date}  ${
                        line.intervals.length === 0
                          ? "—"
                          : line.intervals.join(", ")
                      }`,
                  )
                  .join("\n")}
              </pre>
            )}
            <p
              className="availability-preview-hint"
              data-testid="availability-preview-hint"
            >
              Calendar conflicts from connected calendars will subtract from
              these times.
            </p>
          </section>

          {!hasAnyAvailability ? (
            <div
              className="empty-state"
              data-testid="availability-empty"
            >
              <p className="empty-state-title">No Availability yet.</p>
              <p>
                Add a weekly window or a one-off override above to start
                appearing in Organizer Searches.
              </p>
            </div>
          ) : null}
        </>
      )}

      {pageErrorCode ? (
        <p
          className="availability-form-error"
          role="alert"
          aria-live="polite"
          data-testid="availability-page-error"
        >
          {formatAvailabilityError(
            pageErrorCode as never,
            (errorField ?? "form") as never,
          )}
        </p>
      ) : null}
    </main>
  );
}
