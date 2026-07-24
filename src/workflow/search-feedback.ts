import * as Iron from "@hapi/iron";

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
};

export type SearchFormValues = SearchFeedbackTokenPayload["values"];
export type SearchFieldName = SearchFeedbackTokenPayload["field"];

export async function sealSearchFeedbackToken(
  payload: SearchFeedbackTokenPayload,
): Promise<string> {
  return Iron.seal(payload, getSessionSecret(), Iron.defaults);
}

export async function unsealSearchFeedbackToken(
  sealed: string,
): Promise<SearchFeedbackTokenPayload | null> {
  try {
    const payload = (await Iron.unseal(
      sealed,
      getSessionSecret(),
      Iron.defaults,
    )) as SearchFeedbackTokenPayload;
    if (!isValidFeedbackPayload(payload)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function isValidFeedbackPayload(
  value: unknown,
): value is SearchFeedbackTokenPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.field === "string" &&
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
