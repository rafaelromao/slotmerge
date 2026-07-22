import { requirePageContext } from "../../../../src/lib/page-context";
import { systemClock } from "../../../../src/system/clock";
import { createAvailabilityWorkflow } from "../../../../src/workflow/availability";
import { buildAvailabilityPageRepositories } from "../../../../src/profile/availability-page-repositories";
import { AvailabilityView } from "../_components/AvailabilityView";
import {
  addWindowAction,
  removeWindowAction,
  addOverrideAction,
  removeOverrideAction,
} from "../_actions/availability";

type SearchParams = Promise<{
  saved?: string | string[];
  error?: string | string[];
  field?: string | string[];
  target?: string | string[];
  source?: string | string[];
}>;

const VALID_ERROR_CODES = new Set<string>([
  "end_before_start",
  "overlap_existing_window",
  "outside_day",
  "invalid_time",
  "date_required",
  "profile_timezone_required",
  "invalid_buffer",
  "not_found",
]);

const VALID_FIELDS = new Set<string>([
  "dayOfWeek",
  "startTime",
  "endTime",
  "date",
  "type",
  "profileTimezone",
  "bufferMinutes",
  "form",
]);

const VALID_TARGETS = new Set<string>(["window", "override", "buffer", "page"]);

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });

  const params = (await searchParams) ?? {};
  const saved = firstString(params.saved) === "1";
  const errorCode = firstString(params.error);
  const errorField = firstString(params.field);
  const errorTarget = firstString(params.target);

  const validErrorCode =
    errorCode && VALID_ERROR_CODES.has(errorCode) ? errorCode : null;
  const validErrorField =
    errorField && VALID_FIELDS.has(errorField) ? errorField : null;
  const validErrorTarget =
    errorTarget && VALID_TARGETS.has(errorTarget) ? errorTarget : null;

  const repositories = buildAvailabilityPageRepositories();
  const workflow = createAvailabilityWorkflow({
    clock: systemClock(),
    listWindows: async (userId) => {
      "use server";
      return repositories.windows.listByUserId(userId);
    },
    addWindow: async (userId, request, profileTimezone) => {
      "use server";
      return repositories.windows.add(userId, request, profileTimezone);
    },
    findWindow: async (id, userId) => {
      "use server";
      return repositories.windows.findById(id, userId);
    },
    removeWindowById: async (id, userId) => {
      "use server";
      return repositories.windows.removeById(id, userId);
    },
    listOverrides: async (userId) => {
      "use server";
      return repositories.overrides.listByUserId(userId);
    },
    addOverride: async (userId, request, profileTimezone) => {
      "use server";
      return repositories.overrides.add(userId, request, profileTimezone);
    },
    removeOverrideById: async (id, userId) => {
      "use server";
      return repositories.overrides.removeById(id, userId);
    },
    getProfile: async (userId) => {
      "use server";
      return repositories.profile.findByUserId(userId);
    },
  });

  const now = systemClock().now();
  const stateResult = await workflow.loadPageState({
    userId: context.user.id,
    now,
  });

  const timezoneRequired = !stateResult.ok;
  const profileTimezone = timezoneRequired
    ? null
    : stateResult.value.profileTimezone;
  const bufferMinutes = timezoneRequired ? 0 : stateResult.value.bufferMinutes;
  const bufferValid = workflow.validateBuffer({ bufferMinutes });
  const bufferError = bufferValid.ok ? null : (validErrorCode === "invalid_buffer" ? "invalid_buffer" : null);

  const windowsByDay = timezoneRequired
    ? { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    : stateResult.value.windowsByDay;
  const overrides = timezoneRequired ? [] : stateResult.value.overrides;
  const previewLines = timezoneRequired ? [] : stateResult.value.previewLines;

  return (
    <AvailabilityView
      csrfToken={context.csrfToken}
      profileTimezone={profileTimezone}
      bufferMinutes={bufferMinutes}
      bufferIsInvalid={!bufferValid.ok}
      timezoneRequired={timezoneRequired}
      saved={saved}
      windowsByDay={windowsByDay}
      overrides={overrides}
      previewLines={previewLines}
      errorCode={validErrorCode}
      errorField={validErrorField}
      errorTarget={validErrorTarget}
      addWindowAction={addWindowAction}
      removeWindowAction={removeWindowAction}
      addOverrideAction={addOverrideAction}
      removeOverrideAction={removeOverrideAction}
      bufferError={bufferError}
    />
  );
}
