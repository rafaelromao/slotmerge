import { timingSafeEqual } from "node:crypto";

import { requirePageContext, type PageContext } from "../lib/page-context";
import {
  createProfileWorkflow,
  type ProfilePatch,
  type ProfileWorkflow,
} from "./profile-workflow";

export type UpdateProfileFormValues = Record<string, string>;

export type UpdateProfileActionState = {
  ok: "idle" | "success" | "error";
  fieldErrors?: Record<string, string>;
  values?: UpdateProfileFormValues;
};

export type UpdateProfileActionDeps = {
  getUserContext?: () => Promise<PageContext>;
  workflow?: ProfileWorkflow;
};

export function buildUpdateProfileAction(
  deps: UpdateProfileActionDeps = {},
): (formData: FormData) => Promise<UpdateProfileActionState> {
  const getUserContext = deps.getUserContext ?? defaultGetUserContext;
  const workflow = deps.workflow ?? createProfileWorkflow();

  return async function updateProfileAction(
    formData: FormData,
  ): Promise<UpdateProfileActionState> {
    const context = await getUserContext();
    assertCsrfToken(formData, context.csrfToken);

    const rawValues = readFormValues(formData);
    const patch = buildPatch(rawValues);

    const result = await workflow.updateProfile({
      userId: context.user.id,
      patch,
    });

    if (!result.ok) {
      return {
        ok: "error",
        fieldErrors: result.error.fieldErrors,
        values: rawValues,
      };
    }

    return { ok: "success" };
  };
}

export function __resetUpdateProfileActionDepsForTests(): void {
  // No module-level state to reset; tests inject deps via
  // `buildUpdateProfileAction({...})` for hermetic isolation.
}

async function defaultGetUserContext(): Promise<PageContext> {
  return requirePageContext({
    roles: ["user", "organizer", "admin"],
  });
}

function assertCsrfToken(formData: FormData, expected: string): void {
  const token = formData.get("_csrf");
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("CSRF check failed");
  }
  if (token.length !== expected.length) {
    throw new Error("CSRF check failed");
  }
  const ok = timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!ok) {
    throw new Error("CSRF check failed");
  }
}

function readFormValues(formData: FormData): UpdateProfileFormValues {
  const fields = [
    "displayName",
    "profileTimezone",
    "bufferMinutes",
    "avatarUrl",
    "shortBio",
  ];
  const values: UpdateProfileFormValues = {};
  for (const field of fields) {
    const raw = formData.get(field);
    values[field] = typeof raw === "string" ? raw : "";
  }
  return values;
}

function buildPatch(values: UpdateProfileFormValues): ProfilePatch {
  const patch: ProfilePatch = {};

  patch.displayName = values.displayName ?? "";

  const timezone = values.profileTimezone?.trim();
  patch.profileTimezone = timezone ? timezone : null;

  const rawBuffer = values.bufferMinutes?.trim() ?? "";
  if (rawBuffer === "") {
    patch.bufferMinutes = 0;
  } else {
    const parsed = Number(rawBuffer);
    patch.bufferMinutes = Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  const avatarUrl = values.avatarUrl?.trim() ?? "";
  patch.avatarUrl = avatarUrl === "" ? null : avatarUrl;

  const shortBio = values.shortBio?.trim() ?? "";
  patch.shortBio = shortBio === "" ? null : shortBio;

  return patch;
}
