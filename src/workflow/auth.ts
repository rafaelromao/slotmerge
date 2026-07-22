import { createHash, randomUUID } from "node:crypto";

import {
  createMagicLinkRequestHandlers,
  type MagicLinkRequestDependencies,
} from "../auth/magic-link-request";
import { systemDependencies } from "../system";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type RequestContext = {
  requestId: string;
  ipHash: string;
  userAgent: string | null;
};

export type AuthError = "invalid_email" | "rate_limited" | "request_failed";

export type AuthWorkflow = {
  requestMagicLink(input: {
    email: string;
    requestContext: RequestContext;
  }): Promise<Result<void, AuthError>>;
};

export function createAuthWorkflow(
  dependencies: MagicLinkRequestDependencies = systemDependencies(),
): AuthWorkflow {
  const handlers = createMagicLinkRequestHandlers(dependencies);

  return {
    async requestMagicLink({ email, requestContext }) {
      const response = await handlers.POST(
        new Request("http://localhost/auth/magic-link/request", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-forwarded-for": requestContext.ipHash,
            "x-request-id": requestContext.requestId,
            ...(requestContext.userAgent
              ? { "user-agent": requestContext.userAgent }
              : {}),
          },
          body: new URLSearchParams({ email }).toString(),
        }),
      );

      if (response.status === 202) {
        return { ok: true, value: undefined };
      }
      if (response.status === 400) {
        return { ok: false, error: "invalid_email" };
      }
      if (response.status === 429) {
        return { ok: false, error: "rate_limited" };
      }
      return { ok: false, error: "request_failed" };
    },
  };
}

export function requestContextFromRequest(request: Request): RequestContext {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const clientKey =
    forwardedFor ?? request.headers.get("x-real-ip") ?? "anonymous";
  return {
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    ipHash: createHash("sha256").update(clientKey).digest("base64url"),
    userAgent: request.headers.get("user-agent"),
  };
}

export const authWorkflow = createAuthWorkflow();
