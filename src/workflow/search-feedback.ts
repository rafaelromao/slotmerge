import * as Iron from "@hapi/iron";
import { createHash } from "node:crypto";

import { getSessionSecret } from "../auth/session";
import type { SearchFieldErrorCode, SearchFieldErrors } from "./search";

export type SearchFeedbackTokenPayload = {
  code: SearchFieldErrorCode;
  field:
    | "selectedTopics"
    | "minimumMatchingUsers"
    | "durationMinutes"
    | "dateRangeEnd"
    | "organizerTimezone";
  values: {
    selectedTopicIds: string[];
    minimumMatchingUsers: string;
    durationMinutes: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    organizerTimezone: string;
  };
  formId: string;
  path: string;
  csrfTokenHash: string;
  issuedAt: number;
};

export type SearchFormValues = SearchFeedbackTokenPayload["values"];
export type SearchFieldName = SearchFeedbackTokenPayload["field"];

export const SEARCH_FORM_ID = "searches/run";
export const SEARCH_FEEDBACK_TTL_MS = 5 * 60_000;

export async function sealSearchFeedbackToken(
  payload: SearchFeedbackTokenPayload,
): Promise<string> {
  return Iron.seal(payload, getSessionSecret(), Iron.defaults);
}

export type UnsealContext = {
  csrfToken: string;
  path: string;
  formId?: string;
  now?: number;
};

export async function unsealSearchFeedbackToken(
  sealed: string,
  context: UnsealContext,
): Promise<SearchFeedbackTokenPayload | null> {
  let payload: unknown;
  try {
    payload = (await Iron.unseal(
      sealed,
      getSessionSecret(),
      Iron.defaults,
    )) as SearchFeedbackTokenPayload;
  } catch {
    return null;
  }
  if (!isValidFeedbackPayload(payload)) {
    return null;
  }
  const now = context.now ?? Date.now();
  if (now - payload.issuedAt > SEARCH_FEEDBACK_TTL_MS) {
    return null;
  }
  if (payload.path !== context.path) {
    return null;
  }
  if (payload.formId !== (context.formId ?? SEARCH_FORM_ID)) {
    return null;
  }
  const expectedHash = hashToken(context.csrfToken);
  if (payload.csrfTokenHash !== expectedHash) {
    return null;
  }
  return payload;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isValidFeedbackPayload(
  value: unknown,
): value is SearchFeedbackTokenPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.field === "string" &&
    typeof candidate.formId === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.csrfTokenHash === "string" &&
    typeof candidate.issuedAt === "number" &&
    typeof candidate.values === "object" &&
    candidate.values !== null
  );
}

export function feedbackToFieldErrors(payload: SearchFeedbackTokenPayload): {
  field: SearchFieldName;
  fieldErrors: SearchFieldErrors;
  values: SearchFormValues;
} {
  const fieldErrors: SearchFieldErrors = { [payload.field]: payload.code };
  return {
    field: payload.field,
    fieldErrors,
    values: payload.values,
  };
}
