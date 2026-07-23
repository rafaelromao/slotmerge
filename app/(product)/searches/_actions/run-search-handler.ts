import type { Session } from "../../../../src/auth/session";
import { assertCsrfFromFormData, CsrfError } from "../../../../src/lib/csrf";
import {
  type SearchFormDefaults,
  type SearchFieldErrorCode,
  type SearchFieldErrors,
  type SearchWorkflow,
} from "../../../../src/workflow/search";
import { loadRuntimeConfig } from "../../../../src/config/runtime";

export type SearchFormErrorField =
  | "selectedTopics"
  | "minimumMatchingUsers"
  | "durationMinutes"
  | "dateRangeStart"
  | "dateRangeEnd"
  | "organizerTimezone"
  | "form";

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
      code: SearchFieldErrorCode;
      field: SearchFormErrorField;
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

function readDateField(formData: FormData, key: string): Date {
  const raw = extractFieldString(formData, key);
  if (!raw) return new Date(NaN);
  return new Date(raw);
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
  const dateRangeStart = readDateField(formData, "dateRangeStart");
  const dateRangeEnd = readDateField(formData, "dateRangeEnd");

  return {
    selectedTopicIds: values.selectedTopicIds,
    minimumMatchingUsers: parseIntegerField(formData, "minimumMatchingUsers"),
    durationMinutes: parseIntegerField(formData, "durationMinutes"),
    dateRangeStart,
    dateRangeEnd,
    organizerTimezone: values.organizerTimezone,
  };
}

function firstFieldError(
  errors: SearchFieldErrors,
): { code: SearchFieldErrorCode; field: SearchFormErrorField } | null {
  if (errors.selectedTopics) {
    return {
      code: errors.selectedTopics,
      field: "selectedTopics",
    };
  }
  if (errors.minimumMatchingUsers) {
    return {
      code: errors.minimumMatchingUsers,
      field: "minimumMatchingUsers",
    };
  }
  if (errors.durationMinutes) {
    return {
      code: errors.durationMinutes,
      field: "durationMinutes",
    };
  }
  if (errors.dateRangeEnd) {
    return {
      code: errors.dateRangeEnd,
      field: "dateRangeEnd",
    };
  }
  if (errors.organizerTimezone) {
    return {
      code: errors.organizerTimezone,
      field: "organizerTimezone",
    };
  }
  return null;
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
        return { kind: "redirect", to: `/searches/${result.searchId}` };
      }

      const first = firstFieldError(result.fieldErrors);
      if (!first) {
        return {
          kind: "form-error",
          code: "selected_topics_required",
          field: "selectedTopics",
          values,
        };
      }
      return {
        kind: "form-error",
        code: first.code,
        field: first.field,
        values,
      };
    },
  };
}
