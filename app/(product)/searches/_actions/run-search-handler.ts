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
      csrfToken: string;
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
  fetchCsrfToken?: (
    formData: FormData,
    session: { csrfToken: string },
  ) => string;
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
  if (!match) return new Date(NaN);
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return new Date(NaN);
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return new Date(NaN);
  }
  if (!isValidIanaTimezone(timezone)) {
    return new Date(NaN);
  }
  return zonedTimeToUtc(year, month - 1, day, timezone);
}

function isValidIanaTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
}

function zonedTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  timezone: string,
): Date {
  for (let hour = 0; hour < 24; hour++) {
    const candidate = new Date(Date.UTC(year, monthIndex, day, hour));
    if (
      formatDateInTimezone(candidate, timezone) ===
      formatDateParts(year, monthIndex, day)
    ) {
      return candidate;
    }
  }
  return new Date(NaN);
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatDateParts(
  year: number,
  monthIndex: number,
  day: number,
): string {
  const month = String(monthIndex + 1).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  return `${year}-${month}-${dayStr}`;
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
  const { workflow, loadSession, fetchCsrfToken } = deps;

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

      const csrfToken = (fetchCsrfToken ?? defaultFetchCsrfToken)(
        formData,
        session,
      );
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
        csrfToken,
      };
    },
  };
}

function defaultFetchCsrfToken(
  formData: FormData,
  session: { csrfToken: string },
): string {
  const fromForm = formData.get("_csrf");
  if (typeof fromForm === "string" && fromForm) {
    return fromForm;
  }
  return session.csrfToken;
}
