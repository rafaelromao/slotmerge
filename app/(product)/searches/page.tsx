import { requirePageContext } from "../../../src/lib/page-context";
import { buildTopicsPageRepositories } from "../../../src/topics/page-repositories";
import { listActiveTopics } from "../../../src/topics/repository";
import { createTopicWorkflow } from "../../../src/topics/topic-workflow";
import { getDiscoverableUserRepository } from "../../../src/search/discoverable-user-repository";
import { getProfileByUserId } from "../../../src/profile/repository";
import { getSearchResultRepository } from "../../../src/search/search-result-repository";
import { systemClock } from "../../../src/system/clock";
import { createSearchWorkflow } from "../../../src/workflow/search";
import {
  feedbackToFieldErrors,
  unsealSearchFeedbackToken,
} from "../../../src/workflow/search-feedback";
import { runSearchAction } from "./_actions/run-search";

type SearchParams = Promise<{
  feedback?: string | string[];
}>;

type FieldErrorCode =
  | "selected_topics_required"
  | "topic_retired"
  | "minimum_out_of_range"
  | "duration_out_of_range"
  | "date_range_invalid"
  | "date_range_too_long"
  | "organizer_timezone_required";

const VALID_FIELD_ERROR_CODES = new Set<FieldErrorCode>([
  "selected_topics_required",
  "topic_retired",
  "minimum_out_of_range",
  "duration_out_of_range",
  "date_range_invalid",
  "date_range_too_long",
  "organizer_timezone_required",
]);

const FIELD_ERROR_MESSAGES: Record<FieldErrorCode, string> = {
  selected_topics_required: "Select at least one active Topic.",
  topic_retired:
    "One or more selected Topics are no longer active. Pick a different Topic set.",
  minimum_out_of_range:
    "Minimum matching Users must be at least 2 and not exceed the matching pool.",
  duration_out_of_range: "Meeting duration must be between 15 and 240 minutes.",
  date_range_invalid: "Date range end must be after the start.",
  date_range_too_long: "Date range must be 90 days or less.",
  organizer_timezone_required:
    "Set your profile timezone before running a Search.",
};

function formatDateForInput(date: Date, timezone: string): string {
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function parseFieldErrorCode(raw: string | undefined): FieldErrorCode | null {
  if (!raw) return null;
  return VALID_FIELD_ERROR_CODES.has(raw as FieldErrorCode)
    ? (raw as FieldErrorCode)
    : null;
}

function readFirstString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function SearchesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["organizer", "admin"],
  });

  const params = (await searchParams) ?? {};
  const feedbackSealed = readFirstString(params.feedback);
  const feedbackToken = feedbackSealed
    ? await unsealSearchFeedbackToken(feedbackSealed, {
        csrfToken: context.csrfToken,
        path: "/searches",
      })
    : null;
  const decoded = feedbackToken ? feedbackToFieldErrors(feedbackToken) : null;
  const fieldErrors = decoded?.fieldErrors ?? {};
  const selectedErrorField: keyof typeof fieldErrors | null =
    fieldErrors.selectedTopics
      ? "selectedTopics"
      : fieldErrors.minimumMatchingUsers
        ? "minimumMatchingUsers"
        : fieldErrors.durationMinutes
          ? "durationMinutes"
          : fieldErrors.dateRangeEnd
            ? "dateRangeEnd"
            : fieldErrors.organizerTimezone
              ? "organizerTimezone"
              : null;
  const selectedErrorCode = selectedErrorField
    ? fieldErrors[selectedErrorField]
    : null;
  const errorCode = selectedErrorCode
    ? parseFieldErrorCode(selectedErrorCode)
    : null;
  const errorField = selectedErrorField ?? undefined;
  const feedbackValues = decoded?.values;

  const workflow = createSearchWorkflow({
    clock: systemClock(),
    profileRepository: {
      findByUserId: getProfileByUserId,
    },
    activeTopicsRepository: {
      async listActive() {
        const entries = await listActiveTopics();
        return entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: "active" as const,
        }));
      },
    },
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  });

  const topicRepositories = buildTopicsPageRepositories();
  const topicWorkflow = createTopicWorkflow({
    catalogue: topicRepositories.catalogue,
    proposals: topicRepositories.proposals,
    clock: systemClock(),
  });

  const [formState, activeTopics] = await Promise.all([
    workflow.buildForm({ userId: context.user.id }),
    topicWorkflow.listActive(),
  ]);

  const hasActiveTopics = activeTopics.length > 0;
  const defaults = formState.defaults;
  const displayTimezone = defaults.organizerTimezone || "UTC";
  const fb = feedbackValues;
  const hasFeedback = fb !== undefined;

  const dateRangeStartInput = hasFeedback
    ? (fb?.dateRangeStart ??
      formatDateForInput(defaults.dateRangeStart, displayTimezone))
    : formatDateForInput(defaults.dateRangeStart, displayTimezone);
  const dateRangeEndInput = hasFeedback
    ? (fb?.dateRangeEnd ??
      formatDateForInput(defaults.dateRangeEnd, displayTimezone))
    : formatDateForInput(defaults.dateRangeEnd, displayTimezone);
  const minimumMatchingUsersInput = hasFeedback
    ? (fb?.minimumMatchingUsers ?? String(defaults.minimumMatchingUsers))
    : String(defaults.minimumMatchingUsers);
  const durationMinutesInput = hasFeedback
    ? (fb?.durationMinutes ?? String(defaults.durationMinutes))
    : String(defaults.durationMinutes);
  const organizerTimezoneInput = hasFeedback
    ? (fb?.organizerTimezone ?? defaults.organizerTimezone)
    : defaults.organizerTimezone;
  const selectedTopicIds = new Set(fb?.selectedTopicIds ?? []);
  const errorMessage =
    errorCode === "organizer_timezone_required"
      ? FIELD_ERROR_MESSAGES.organizer_timezone_required
      : null;
  const isTimezoneError =
    errorCode === "organizer_timezone_required" &&
    errorField === "organizerTimezone";

  return (
    <main className="app-container" data-testid="searches-page">
      <h1 data-testid="searches-page-heading">Run a Search</h1>

      {errorMessage ? (
        <p
          className="form-error-banner"
          role="alert"
          data-testid="searches-error-banner"
          data-field={errorField ?? ""}
          data-code={errorCode ?? ""}
        >
          {errorMessage} <a href="/me/profile">Set timezone</a>
        </p>
      ) : null}

      <p
        className="searches-defaults-summary"
        data-testid="searches-defaults-summary"
      >
        Snapshot range:{" "}
        {formatDateForInput(defaults.dateRangeStart, displayTimezone)} →{" "}
        {formatDateForInput(defaults.dateRangeEnd, displayTimezone)} (
        {defaults.organizerTimezone || "not set"})
      </p>

      <form
        action={runSearchAction}
        noValidate
        className="searches-form"
        data-testid="searches-form"
      >
        <input type="hidden" name="_csrf" value={context.csrfToken} />

        <fieldset
          className="searches-fieldset"
          data-testid="searches-topics-fieldset"
          aria-invalid={errorField === "selectedTopics"}
          aria-describedby={
            errorField === "selectedTopics" ? "selectedTopics-error" : undefined
          }
        >
          <legend>Topics</legend>
          {hasActiveTopics ? (
            <ul
              className="searches-topics-list"
              data-testid="searches-topics-list"
            >
              {activeTopics.map((topic) => (
                <li
                  key={topic.id}
                  className="searches-topic-row"
                  data-testid={`searches-topic-row-${topic.id}`}
                >
                  <label htmlFor={`topic-${topic.id}`}>
                    <input
                      id={`topic-${topic.id}`}
                      type="checkbox"
                      name="topicIds"
                      value={topic.id}
                      defaultChecked={selectedTopicIds.has(topic.id)}
                      data-testid={`searches-topic-checkbox-${topic.id}`}
                    />
                    <span>{topic.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="empty-state"
              data-testid="searches-topics-empty"
              role="status"
            >
              <p className="empty-state-title">No active Topics yet.</p>
              <p>An Admin must curate Topics before a Search can run.</p>
              <a className="btn btn-primary" href="/me">
                Back to setup
              </a>
            </div>
          )}

          <p
            className="searches-matching-rule"
            data-testid="searches-matching-rule"
          >
            Users must have all selected active Topics.
          </p>

          {fieldErrors.selectedTopics ? (
            <p
              id="selectedTopics-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-selectedTopics"
            >
              {FIELD_ERROR_MESSAGES[fieldErrors.selectedTopics]}
            </p>
          ) : null}
        </fieldset>

        <div className="searches-field" data-testid="searches-minimum-field">
          <label htmlFor="minimumMatchingUsers">Minimum matching Users</label>
          <input
            id="minimumMatchingUsers"
            type="number"
            name="minimumMatchingUsers"
            min={2}
            defaultValue={minimumMatchingUsersInput}
            aria-invalid={errorField === "minimumMatchingUsers"}
            aria-describedby={
              errorField === "minimumMatchingUsers"
                ? "minimumMatchingUsers-error"
                : undefined
            }
            data-testid="searches-minimum-input"
          />
          {fieldErrors.minimumMatchingUsers ? (
            <p
              id="minimumMatchingUsers-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-minimumMatchingUsers"
            >
              {FIELD_ERROR_MESSAGES.minimum_out_of_range}
            </p>
          ) : null}
        </div>

        <div className="searches-field" data-testid="searches-duration-field">
          <label htmlFor="durationMinutes">Meeting duration (minutes)</label>
          <input
            id="durationMinutes"
            type="number"
            name="durationMinutes"
            min={15}
            max={240}
            step={5}
            defaultValue={durationMinutesInput}
            aria-invalid={errorField === "durationMinutes"}
            aria-describedby={
              errorField === "durationMinutes"
                ? "durationMinutes-error"
                : undefined
            }
            data-testid="searches-duration-input"
          />
          {fieldErrors.durationMinutes ? (
            <p
              id="durationMinutes-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-durationMinutes"
            >
              {FIELD_ERROR_MESSAGES.duration_out_of_range}
            </p>
          ) : null}
        </div>

        <div className="searches-field" data-testid="searches-daterange-field">
          <label htmlFor="dateRangeStart">Date range start</label>
          <input
            id="dateRangeStart"
            type="date"
            name="dateRangeStart"
            defaultValue={dateRangeStartInput}
            data-testid="searches-daterange-start"
          />
          <label htmlFor="dateRangeEnd">Date range end</label>
          <input
            id="dateRangeEnd"
            type="date"
            name="dateRangeEnd"
            defaultValue={dateRangeEndInput}
            aria-invalid={errorField === "dateRangeEnd"}
            aria-describedby={
              errorField === "dateRangeEnd" ? "dateRangeEnd-error" : undefined
            }
            data-testid="searches-daterange-end"
          />
          {fieldErrors.dateRangeEnd ? (
            <p
              id="dateRangeEnd-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-dateRangeEnd"
            >
              {FIELD_ERROR_MESSAGES[fieldErrors.dateRangeEnd]}
            </p>
          ) : null}
        </div>

        <div className="searches-field" data-testid="searches-timezone-field">
          <label htmlFor="organizerTimezone">Timezone</label>
          <input
            id="organizerTimezone"
            type="text"
            name="organizerTimezone"
            defaultValue={organizerTimezoneInput}
            aria-invalid={isTimezoneError || !!fieldErrors.organizerTimezone}
            aria-describedby={
              isTimezoneError || fieldErrors.organizerTimezone
                ? "organizerTimezone-error"
                : undefined
            }
            data-testid="searches-timezone-input"
          />
          {fieldErrors.organizerTimezone ? (
            <p
              id="organizerTimezone-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-organizerTimezone"
            >
              {FIELD_ERROR_MESSAGES.organizer_timezone_required}{" "}
              <a href="/me/profile">Set timezone</a>
            </p>
          ) : null}
        </div>

        <div className="searches-actions">
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="searches-run-button"
            disabled={!hasActiveTopics}
            title={hasActiveTopics ? undefined : "No active Topics available."}
          >
            Run Search
          </button>
        </div>
      </form>
    </main>
  );
}
