import { type Session } from "../../../../src/auth/session";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { assertCsrfFromFormData, CsrfError } from "../../../../src/lib/csrf";
import {
  createDiscoverabilityWorkflow,
  type DiscoverabilityWorkflow,
} from "../../../../src/workflow/discoverability";
import type { DiscoverabilityConsentRepository } from "../../../../src/profile/discoverability-consent";

export type SetDiscoverabilityFieldErrorKey = "confirmed" | "form";

export type SetDiscoverabilityActionFieldErrors = Partial<
  Record<SetDiscoverabilityFieldErrorKey, string>
>;

export type SetDiscoverabilityFormErrorCode =
  | "consent_required"
  | "consent_already_granted"
  | "consent_already_revoked"
  | "invalid_submission";

export type SetDiscoverabilityActionResult =
  | { kind: "redirect"; to: string }
  | {
      kind: "form-error";
      code: SetDiscoverabilityFormErrorCode;
      fieldErrors: SetDiscoverabilityActionFieldErrors;
    }
  | { kind: "csrf-error" };

export type SetDiscoverabilityActionHandler = (input: {
  formData: FormData;
  request: Request;
}) => Promise<SetDiscoverabilityActionResult>;

export type CreateSetDiscoverabilityActionHandlerDeps = {
  repository: DiscoverabilityConsentRepository;
  loadSession: (request: Request) => Promise<Session | null>;
};

function extractFieldStrings(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function buildFieldErrors(
  code: SetDiscoverabilityFormErrorCode,
): SetDiscoverabilityActionFieldErrors {
  switch (code) {
    case "consent_required":
      return {
        confirmed: "Please tick the consent checkbox before saving.",
      };
    case "consent_already_granted":
      return {
        form: "Consent is already granted. Use Revoke to change it.",
      };
    case "consent_already_revoked":
      return {
        form: "Consent is already revoked. Tick the checkbox to re-grant.",
      };
    case "invalid_submission":
      return {
        form: "Please check your selection and try again.",
      };
  }
}

export function createSetDiscoverabilityActionHandler(
  deps: CreateSetDiscoverabilityActionHandlerDeps,
): SetDiscoverabilityActionHandler {
  const workflow: DiscoverabilityWorkflow = createDiscoverabilityWorkflow({
    repository: deps.repository,
  });

  return async ({ formData, request }) => {
    const session = await deps.loadSession(request);
    if (!session) {
      return { kind: "redirect", to: "/sign-in" };
    }

    try {
      assertCsrfFromFormData(formData, session);
    } catch (error) {
      if (error instanceof CsrfError) {
        return { kind: "csrf-error" };
      }
      throw error;
    }

    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(loadRuntimeConfig().appPublicUrl).origin;
    if (origin !== expectedOrigin) {
      return { kind: "csrf-error" };
    }

    const grantedField = extractFieldStrings(formData, "granted");
    const confirmedField = extractFieldStrings(formData, "confirmed");

    if (grantedField !== "true" && grantedField !== "false") {
      return {
        kind: "form-error",
        code: "invalid_submission",
        fieldErrors: buildFieldErrors("invalid_submission"),
      };
    }

    const granted = grantedField === "true";

    const result = await workflow.set({
      userId: session.user.id,
      granted,
      confirmed: confirmedField === "on" || confirmedField === "true",
    });

    if (result.ok) {
      return { kind: "redirect", to: "/me/discoverability" };
    }

    return {
      kind: "form-error",
      code: result.error.code,
      fieldErrors: buildFieldErrors(result.error.code),
    };
  };
}

export { buildFieldErrors, extractFieldStrings };
