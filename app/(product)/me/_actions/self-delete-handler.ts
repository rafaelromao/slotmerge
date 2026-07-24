import { clearSessionCookie, type Session } from "../../../../src/auth/session";
import { assertCsrfFromFormData, CsrfError } from "../../../../src/lib/csrf";
import type { AccountWorkflow } from "../../../../src/workflow/account";

export type SelfDeleteAction = (request: Request) => Promise<Response>;

export function createSelfDeleteActionHandler(deps: {
  workflow: AccountWorkflow;
  loadSession: (request: Request) => Promise<Session | null>;
  expectedOrigin: string | (() => string);
}): SelfDeleteAction {
  return async function selfDeleteAction(request) {
    const expectedOrigin =
      typeof deps.expectedOrigin === "function"
        ? deps.expectedOrigin()
        : deps.expectedOrigin;
    const session = await deps.loadSession(request);
    if (!session) {
      return redirectResponse(expectedOrigin, "/sign-in");
    }

    if (
      request.headers.get("origin") !== expectedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    ) {
      return redirectResponse(expectedOrigin, "/me/delete?error=csrf");
    }

    const formData = await request.formData();
    try {
      assertCsrfFromFormData(formData, session);
    } catch (error) {
      if (error instanceof CsrfError) {
        return redirectResponse(expectedOrigin, "/me/delete?error=csrf");
      }
      throw error;
    }
    const confirmation = formData.get("confirmation");
    if (confirmation !== "DELETE") {
      const error =
        confirmation === null || confirmation === ""
          ? "confirm_required"
          : "confirm_mismatch";
      return redirectResponse(expectedOrigin, `/me/delete?error=${error}`);
    }

    const result = await deps.workflow.selfDelete({ userId: session.user.id });
    if (!result.ok) {
      return redirectResponse(expectedOrigin, "/sign-in");
    }

    return redirectResponse(expectedOrigin, "/sign-in?reason=deleted", {
      "Set-Cookie": clearSessionCookie(),
    });
  };
}

function redirectResponse(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(null, {
    status: 303,
    headers: {
      ...headers,
      Location: new URL(path, baseUrl).toString(),
    },
  });
}
