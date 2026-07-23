import { requirePageContext } from "../../../src/lib/page-context";
import { buildTopicsPageRepositories } from "../../../src/topics/page-repositories";
import { listActiveTopics } from "../../../src/topics/repository";
import { createTopicWorkflow } from "../../../src/topics/topic-workflow";
import { getDiscoverableUserRepository } from "../../../src/search/discoverable-user-repository";
import { getProfileByUserId } from "../../../src/profile/repository";
import { getSearchResultRepository } from "../../../src/search/search-result-repository";
import { systemClock } from "../../../src/system/clock";
import { createSearchWorkflow } from "../../../src/workflow/search";
import { runSearchAction } from "./_actions/run-search";

type SearchParams = Promise<{
  error?: string | string[];
  field?: string | string[];
  topicIds?: string | string[];
  minimumMatchingUsers?: string | string[];
  durationMinutes?: string | string[];
  dateRangeStart?: string | string[];
  dateRangeEnd?: string | string[];
  organizerTimezone?: string | string[];
}>;

type FieldErrorCode =
  | "selected_topics_required"
  | "topic_retired"
  | "minimum_out_of_range"
  | "duration_out_of_range"
  | "date_range_invalid"
  | "organizer_timezone_required";

const VALID_FIELD_ERROR_CODES = new Set<FieldErrorCode>([
  "selected_topics_required",
  "topic_retired",
  "minimum_out_of_range",
  "duration_out_of_range",
  "date_range_invalid",
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

function readStringArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
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
  const errorCode = parseFieldErrorCode(readFirstString(params.error));
  const errorField = readFirstString(params.field);

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

  const [formState, pageStateResult] = await Promise.all([
    workflow.buildForm({ userId: context.user.id }),
    topicWorkflow.loadPageState({ userId: context.user.id }),
  ]);

  if (!pageStateResult.ok) {
    throw new Error("loadPageState unexpectedly returned error: never");
  }
  const activeTopics = pageStateResult.value.catalogue;
  const hasActiveTopics = activeTopics.length > 0;
  const defaults = formState.defaults;

  const dateRangeStartInput = errorCode
    ? (readFirstString(params.dateRangeStart) ??
      formatDateForInput(defaults.dateRangeStart, defaults.organizerTimezone))
    : formatDateForInput(defaults.dateRangeStart, defaults.organizerTimezone);
  const dateRangeEndInput = errorCode
    ? (readFirstString(params.dateRangeEnd) ??
      formatDateForInput(defaults.dateRangeEnd, defaults.organizerTimezone))
    : formatDateForInput(defaults.dateRangeEnd, defaults.organizerTimezone);
  const minimumMatchingUsersInput = errorCode
    ? (readFirstString(params.minimumMatchingUsers) ??
      String(defaults.minimumMatchingUsers))
    : String(defaults.minimumMatchingUsers);
  const durationMinutesInput = errorCode
    ? (readFirstString(params.durationMinutes) ??
      String(defaults.durationMinutes))
    : String(defaults.durationMinutes);
  const organizerTimezoneInput = errorCode
    ? (readFirstString(params.organizerTimezone) ?? defaults.organizerTimezone)
    : defaults.organizerTimezone;
  const selectedTopicIds = new Set(
    errorCode ? readStringArray(params.topicIds) : defaults.selectedTopicIds,
  );
  const errorMessage = errorCode ? FIELD_ERROR_MESSAGES[errorCode] : null;
  const isTimezoneError =
    errorCode === "organizer_timezone_required" &&
    errorField === "organizerTimezone";

  return (
    <main className="app-container" data-testid="searches-page">
      <h1 data-testid="searches-page-heading">Run a Search</h1>

      {errorMessage && errorField !== "form" ? (
        <p
          className="form-error-banner"
          role="alert"
          data-testid="searches-error-banner"
          data-field={errorField ?? ""}
          data-code={errorCode ?? ""}
        >
          {errorMessage}
        </p>
      ) : null}

      <p
        className="searches-defaults-summary"
        data-testid="searches-defaults-summary"
      >
        Snapshot range:{" "}
        {formatDateForInput(
          defaults.dateRangeStart,
          defaults.organizerTimezone,
        )}{" "}
        →{" "}
        {formatDateForInput(defaults.dateRangeEnd, defaults.organizerTimezone)}{" "}
        ({defaults.organizerTimezone})
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

          {errorCode &&
          (errorCode === "selected_topics_required" ||
            errorCode === "topic_retired") &&
          errorField === "selectedTopics" ? (
            <p
              id="selectedTopics-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-selectedTopics"
            >
              {FIELD_ERROR_MESSAGES[errorCode]}
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
          {errorCode === "minimum_out_of_range" &&
          errorField === "minimumMatchingUsers" ? (
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
          {errorCode === "duration_out_of_range" &&
          errorField === "durationMinutes" ? (
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
            aria-invalid={
              errorField === "dateRangeEnd" || errorField === "dateRangeStart"
            }
            aria-describedby={
              errorField === "dateRangeEnd" || errorField === "dateRangeStart"
                ? "dateRangeEnd-error"
                : undefined
            }
            data-testid="searches-daterange-end"
          />
          {errorCode === "date_range_invalid" &&
          (errorField === "dateRangeEnd" || errorField === "dateRangeStart") ? (
            <p
              id="dateRangeEnd-error"
              className="form-field-error"
              role="alert"
              data-testid="searches-field-error-dateRangeEnd"
            >
              {FIELD_ERROR_MESSAGES.date_range_invalid}
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
            aria-invalid={isTimezoneError}
            aria-describedby={
              isTimezoneError ? "organizerTimezone-error" : undefined
            }
            data-testid="searches-timezone-input"
          />
          {isTimezoneError ? (
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
