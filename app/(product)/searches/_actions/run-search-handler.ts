import type { Session } from "../../../../src/auth/session";
import { assertCsrfFromFormData, CsrfError } from "../../../../src/lib/csrf";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import type {
  SearchFieldErrors,
  SearchFormDefaults,
  SearchWorkflow,
} from "../../../../src/workflow/search";

export type SearchFormErrorField = keyof SearchFieldErrors;

export type SearchFormValues = {
  selectedTopicIds: string[];
  minimumMatchingUsers: string;
  durationMinutes: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  organizerTimezone: string;
};

export type SearchActionResult =
  | { kind: "redirect"; to: string }
  | {
      kind: "form-error";
      fieldErrors: SearchFieldErrors;
      values: SearchFormValues;
    }
  | { kind: "csrf-error" };

export type SearchActionInput = {
  formData: FormData;
  request: Request;
};

export type SearchActionHandler = {
  runSearch(input: SearchActionInput): Promise<SearchActionResult>;
};

export type CreateSearchActionHandlerDeps = {
  workflow: SearchWorkflow;
  loadSession: (request: Request) => Promise<Session | null>;
};

function originMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }
  try {
    const expected = new URL(loadRuntimeConfig().appPublicUrl).origin;
    return origin === expected;
  } catch {
    return false;
  }
}

function extractFieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function readDateField(
  formData: FormData,
  key: string,
  timezone: string,
): Date {
  const raw = extractFieldString(formData, key);
  if (!raw) return new Date(NaN);
  return parseCalendarDateInTimezone(raw, timezone);
}

function parseCalendarDateInTimezone(value: string, timezone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return new Date(NaN);
  }
  if (!timezone) {
    return new Date(Date.UTC(year, month - 1, day));
  }
  const offset = getTimezoneOffsetMinutes(year, month, day, timezone);
  return new Date(Date.UTC(year, month - 1, day) - offset * 60_000);
}

function getTimezoneOffsetMinutes(
  year: number,
  month: number,
  day: number,
  timezone: string,
): number {
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).formatToParts(utcDate);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;
  if (!offset) return 0;
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(offset);
  if (!match) return 0;
  const [, sign, hourStr, minStr] = match;
  const hours = Number(hourStr);
  const minutes = minStr ? Number(minStr) : 0;
  return (sign === "-" ? -1 : 1) * (hours * 60 + minutes);
}

function parseTopicIds(formData: FormData): string[] {
  return formData
    .getAll("topicIds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseIntegerField(formData: FormData, key: string): number {
  const raw = extractFieldString(formData, key);
  if (raw === "") return Number.NaN;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readFormValues(formData: FormData): SearchFormValues {
  return {
    selectedTopicIds: parseTopicIds(formData),
    minimumMatchingUsers: extractFieldString(formData, "minimumMatchingUsers"),
    durationMinutes: extractFieldString(formData, "durationMinutes"),
    dateRangeStart: extractFieldString(formData, "dateRangeStart"),
    dateRangeEnd: extractFieldString(formData, "dateRangeEnd"),
    organizerTimezone: extractFieldString(formData, "organizerTimezone"),
  };
}

function readRawFromForm(
  formData: FormData,
  values: SearchFormValues,
): SearchFormDefaults {
  const timezone = values.organizerTimezone.trim() || "UTC";
  const dateRangeStart = readDateField(formData, "dateRangeStart", timezone);
  const dateRangeEnd = readDateField(formData, "dateRangeEnd", timezone);

  return {
    selectedTopicIds: values.selectedTopicIds,
    minimumMatchingUsers: parseIntegerField(formData, "minimumMatchingUsers"),
    durationMinutes: parseIntegerField(formData, "durationMinutes"),
    dateRangeStart,
    dateRangeEnd,
    organizerTimezone: values.organizerTimezone,
  };
}

export function buildSearchActionHandler(
  deps: CreateSearchActionHandlerDeps,
): SearchActionHandler {
  const { workflow, loadSession } = deps;

  return {
    async runSearch({ formData, request }) {
      if (!originMatches(request)) {
        return { kind: "csrf-error" };
      }
      const session = await loadSession(request);
      if (!session) {
        return { kind: "csrf-error" };
      }
      if (session.user.role !== "organizer" && session.user.role !== "admin") {
        return { kind: "csrf-error" };
      }
      try {
        assertCsrfFromFormData(formData, session);
      } catch (error) {
        if (error instanceof CsrfError) {
          return { kind: "csrf-error" };
        }
        throw error;
      }

      const values = readFormValues(formData);
      const raw = readRawFromForm(formData, values);
      const result = await workflow.run({ userId: session.user.id, raw });

      if (result.ok) {
        return { kind: "redirect", to: `/searches/${result.value.searchId}` };
      }

      return {
        kind: "form-error",
        fieldErrors: result.error.fieldErrors,
        values,
      };
    },
  };
}
