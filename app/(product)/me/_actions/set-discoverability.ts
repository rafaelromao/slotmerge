"use server";

import { timingSafeEqual } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getSessionFromRequest,
  type Session,
} from "../../../../src/auth/session";
import { CsrfError } from "../../../../src/lib/csrf";
import {
  createDiscoverabilityWorkflow,
  type DiscoverabilityWorkflow,
} from "../../../../src/workflow/discoverability";
import type { DiscoverabilityConsentRepository } from "../../../../src/profile/discoverability-consent";
import { createPostgresDiscoverabilityConsentRepository } from "../../../../src/profile/discoverability-consent";
import { systemClock } from "../../../../src/system/clock";
import { loadRuntimeConfig } from "../../../../src/config/runtime";

export type SetDiscoverabilityFieldErrorKey = "confirmed" | "form";

export type SetDiscoverabilityActionFieldErrors = Partial<
  Record<SetDiscoverabilityFieldErrorKey, string>
>;

export type SetDiscoverabilityActionResult =
  | { kind: "redirect"; to: string }
  | {
      kind: "form-error";
      code:
        | "consent_required"
        | "consent_already_granted"
        | "consent_already_revoked"
        | "invalid_submission";
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
  code:
    | "consent_required"
    | "consent_already_granted"
    | "consent_already_revoked"
    | "invalid_submission",
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

    const requestToken = request.headers.get("x-csrf-token");
    const formToken = extractFieldStrings(formData, "_csrf");
    const providedToken = requestToken ?? formToken;

    const expected = session.csrfToken;
    if (
      !providedToken ||
      providedToken.length !== expected.length ||
      !safeCsrfEqual(providedToken, expected)
    ) {
      return { kind: "csrf-error" };
    }

    const expectedOrigin = new URL(loadRuntimeConfig().appPublicUrl).origin;
    const origin = request.headers.get("origin");
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

function safeCsrfEqual(actual: string, expected: string): boolean {
  try {
    const a = Buffer.from(actual);
    const e = Buffer.from(expected);
    if (a.length !== e.length) {
      return false;
    }
    return timingSafeEqual(a, e);
  } catch {
    return false;
  }
}

const handler = createSetDiscoverabilityActionHandler({
  repository: createPostgresDiscoverabilityConsentRepository(systemClock()),
  loadSession: async (request) => {
    const session = await getSessionFromRequest(request);
    return session;
  },
});

export async function setDiscoverabilityAction(
  formData: FormData,
): Promise<never> {
  const headersList = await headers();
  const built = new Request("http://localhost/me/discoverability", {
    method: "POST",
    headers: headersList,
  });

  const result = await handler({ formData, request: built });

  switch (result.kind) {
    case "redirect":
      redirect(result.to);
      break;
    case "csrf-error":
      throw new CsrfError();
      break;
    case "form-error":
      redirect(`/me/discoverability?error=${encodeURIComponent(result.code)}`);
      break;
  }
}
