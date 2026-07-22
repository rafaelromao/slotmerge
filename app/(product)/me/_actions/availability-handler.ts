import { timingSafeEqual } from "node:crypto";

import { type Session } from "../../../../src/auth/session";
import {
  createAvailabilityWorkflow,
  type AvailabilityWorkflow,
  type AvailabilityWindowError,
  type AvailabilityOverrideError,
} from "../../../../src/workflow/availability";
import { loadRuntimeConfig } from "../../../../src/config/runtime";

export type AvailabilityFormErrorCode =
  | "end_before_start"
  | "overlap_existing_window"
  | "outside_day"
  | "invalid_time"
  | "date_required"
  | "profile_timezone_required"
  | "invalid_buffer"
  | "not_found";

export type AvailabilityFormErrorField =
  | "dayOfWeek"
  | "startTime"
  | "endTime"
  | "date"
  | "type"
  | "profileTimezone"
  | "bufferMinutes"
  | "form";

export type AvailabilityActionResult =
  | { kind: "redirect"; to: string }
  | {
      kind: "form-error";
      code: AvailabilityFormErrorCode;
      field: AvailabilityFormErrorField;
      target: "window" | "override" | "buffer" | "page";
    }
  | { kind: "csrf-error" };

export type AvailabilityActionInput = {
  formData: FormData;
  request: Request;
};

export type AvailabilityActionHandler = {
  addWindow(input: AvailabilityActionInput): Promise<AvailabilityActionResult>;
  removeWindow(input: AvailabilityActionInput): Promise<AvailabilityActionResult>;
  addOverride(input: AvailabilityActionInput): Promise<AvailabilityActionResult>;
  removeOverride(input: AvailabilityActionInput): Promise<AvailabilityActionResult>;
};

export type CreateAvailabilityActionHandlerDeps = {
  workflow?: AvailabilityWorkflow;
  loadSession: (request: Request) => Promise<Session | null>;
};

function csrfMatches(formData: FormData, session: Session): boolean {
  const token = formData.get("_csrf");
  if (typeof token !== "string" || !token) {
    return false;
  }
  const expected = session.csrfToken;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function extractFieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function buildRedirectUrl(search: Record<string, string>): string {
  const params = new URLSearchParams(search);
  return `/me/availability${params.toString() ? `?${params.toString()}` : ""}`;
}

function originMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }
  try {
    const expected = new URL(loadRuntimeConfig().appPublicUrl).origin;
    return origin === expected;
  } catch {
    return false;
  }
}

function mapWindowError(error: AvailabilityWindowError): {
  code: AvailabilityFormErrorCode;
  field: AvailabilityFormErrorField;
} {
  return {
    code: error.code,
    field: (error.field ?? "startTime") as AvailabilityFormErrorField,
  };
}

function mapOverrideError(error: AvailabilityOverrideError): {
  code: AvailabilityFormErrorCode;
  field: AvailabilityFormErrorField;
} {
  return {
    code: error.code,
    field: (error.field ?? "startTime") as AvailabilityFormErrorField,
  };
}

export function buildAvailabilityActionHandler(
  deps: CreateAvailabilityActionHandlerDeps,
): AvailabilityActionHandler {
  const workflow = deps.workflow ?? createAvailabilityWorkflow();
  const loadSession = deps.loadSession;

  async function loadAuthedSession(
    request: Request,
  ): Promise<Session | null> {
    if (!originMatches(request)) {
      return null;
    }
    return loadSession(request);
  }

  return {
    async addWindow({ formData, request }) {
      const session = await loadAuthedSession(request);
      if (!session) {
        return { kind: "csrf-error" };
      }
      if (!csrfMatches(formData, session)) {
        return { kind: "csrf-error" };
      }
      const dayOfWeekRaw = extractFieldString(formData, "dayOfWeek");
      const startTime = extractFieldString(formData, "startTime");
      const endTime = extractFieldString(formData, "endTime");
      const profileTimezone = extractFieldString(formData, "profileTimezone");
      const dayOfWeek = Number(dayOfWeekRaw);
      const result = await workflow.addWindow({
        userId: session.user.id,
        dayOfWeek,
        startTime,
        endTime,
        profileTimezone,
      });
      if (result.ok) {
        return { kind: "redirect", to: "/me/availability?saved=1" };
      }
      const mapped = mapWindowError(result.error);
      return {
        kind: "form-error",
        code: mapped.code,
        field: mapped.field,
        target: "window",
      };
    },

    async removeWindow({ formData, request }) {
      const session = await loadAuthedSession(request);
      if (!session) {
        return { kind: "csrf-error" };
      }
      if (!csrfMatches(formData, session)) {
        return { kind: "csrf-error" };
      }
      const windowId = extractFieldString(formData, "windowId");
      const result = await workflow.removeWindow({
        userId: session.user.id,
        windowId,
      });
      if (result.ok) {
        return { kind: "redirect", to: "/me/availability?saved=1" };
      }
      return {
        kind: "form-error",
        code: "not_found",
        field: "form",
        target: "window",
      };
    },

    async addOverride({ formData, request }) {
      const session = await loadAuthedSession(request);
      if (!session) {
        return { kind: "csrf-error" };
      }
      if (!csrfMatches(formData, session)) {
        return { kind: "csrf-error" };
      }
      const date = extractFieldString(formData, "date");
      const startTime = extractFieldString(formData, "startTime");
      const endTime = extractFieldString(formData, "endTime");
      const typeRaw = extractFieldString(formData, "type");
      const profileTimezone = extractFieldString(formData, "profileTimezone");
      const type = typeRaw === "block" ? "block" : "add";
      const result = await workflow.addOverride({
        userId: session.user.id,
        date,
        startTime,
        endTime,
        type,
        profileTimezone,
      });
      if (result.ok) {
        return { kind: "redirect", to: "/me/availability?saved=1" };
      }
      const mapped = mapOverrideError(result.error);
      return {
        kind: "form-error",
        code: mapped.code,
        field: mapped.field,
        target: "override",
      };
    },

    async removeOverride({ formData, request }) {
      const session = await loadAuthedSession(request);
      if (!session) {
        return { kind: "csrf-error" };
      }
      if (!csrfMatches(formData, session)) {
        return { kind: "csrf-error" };
      }
      const overrideId = extractFieldString(formData, "overrideId");
      const result = await workflow.removeOverride({
        userId: session.user.id,
        overrideId,
      });
      if (result.ok) {
        return { kind: "redirect", to: "/me/availability?saved=1" };
      }
      return {
        kind: "form-error",
        code: "not_found",
        field: "form",
        target: "override",
      };
    },
  };
}

export function formatAvailabilityError(
  code: AvailabilityFormErrorCode,
  field: AvailabilityFormErrorField,
): string {
  if (field === "bufferMinutes") {
    return "Buffer minutes must be a whole number between 0 and 60. Edit your profile to fix it.";
  }
  if (field === "profileTimezone") {
    return "Set your profile timezone before defining Availability.";
  }
  switch (code) {
    case "end_before_start":
      return "End time must be after start time.";
    case "overlap_existing_window":
      return "This window overlaps an existing window on the same day.";
    case "outside_day":
      return "Time must be inside 00:00–24:00.";
    case "invalid_time":
      return "Enter a valid time in HH:MM format (15-minute increments).";
    case "date_required":
      return "Pick a date for the override.";
    case "profile_timezone_required":
      return "Set your profile timezone before defining Availability.";
    case "invalid_buffer":
      return "Buffer minutes must be a whole number between 0 and 60. Edit your profile to fix it.";
    case "not_found":
      return "This item was not found.";
  }
}

export function buildErrorSearchParams(
  code: AvailabilityFormErrorCode,
  field: AvailabilityFormErrorField,
  target: "window" | "override" | "buffer" | "page",
): Record<string, string> {
  return {
    error: code,
    field,
    target,
  };
}

export { buildRedirectUrl };
