import { randomUUID, timingSafeEqual } from "node:crypto";

import {
  getSessionRepository,
  getSessionSecret,
} from "../../../../src/auth/session";
import {
  claimCalendarOAuthAttempt,
  completeClaimedCalendarConnection,
  hashCalendarOAuthCsrfToken,
  unsealCalendarConnectionState,
} from "../../../../src/calendar/connection";
import { getCalendarProvider } from "../../../../src/calendar/providers";
import { getCalendarConnectionRepository } from "../../../../src/calendar/repository";
import type { CalendarProvider as CalendarProviderId } from "../../../../src/db/schema";
import { createProviderFetchImpl } from "../../../../src/lib/fetch-wrapper";
import { requestContextFromRequest } from "../../../../src/workflow/auth";
import { systemClock } from "../../../../src/system/clock";

type OAuthConfiguration = {
  clientId: string | undefined;
  clientSecret: string | undefined;
  missingError: string;
};

type CallbackRateLimitEntry = { count: number; resetAt: number };
const CALLBACK_RATE_LIMIT_MAX = 30;
const CALLBACK_RATE_LIMIT_WINDOW_MS = 60_000;
const callbackRateLimits = new Map<string, CallbackRateLimitEntry>();

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  return handleCallback({
    error: asStringOrNull(formData.get("error")),
    code: asStringOrNull(formData.get("code")),
    state: asStringOrNull(formData.get("state")),
    request,
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return handleCallback({
    error: url.searchParams.get("error"),
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    request,
  });
}

function asStringOrNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

async function handleCallback({
  error,
  code,
  state,
  request,
}: {
  error: string | null | undefined;
  code: string | null | undefined;
  state: string | null | undefined;
  request: Request;
}): Promise<Response> {
  const requestContext = requestContextFromRequest(request);
  const requestId = safeRequestId(requestContext.requestId);
  const now = systemClock().now();
  if (!takeCallbackRateLimit(requestContext.ipHash, now)) {
    return redirectOutcome(request, "failed", requestId, {
      "Retry-After": String(CALLBACK_RATE_LIMIT_WINDOW_MS / 1000),
    });
  }

  try {
    if (typeof state !== "string" || !state) {
      throw new Error("Calendar OAuth state is missing.");
    }

    const payload = await unsealCalendarConnectionState({
      state,
      secret: getSessionSecret(),
      now,
    });
    const session = await getSessionRepository().findById(
      payload.sessionId,
      now,
    );
    if (!session || session.user.status !== "active") {
      throw new Error("Calendar OAuth session is not active.");
    }
    if (
      !hashesMatch(
        payload.csrfTokenHash,
        hashCalendarOAuthCsrfToken(session.csrfToken),
      )
    ) {
      throw new Error("Calendar OAuth session binding does not match.");
    }

    const repository = getCalendarConnectionRepository();
    const connection = await repository.findById(payload.connectionId);
    if (
      !connection ||
      connection.userId !== session.user.id ||
      connection.provider !== payload.provider ||
      connection.status !== "pending"
    ) {
      throw new Error("Calendar OAuth attempt is not pending.");
    }

    const claimed = await claimCalendarOAuthAttempt({
      repository,
      payload,
      userId: session.user.id,
    });

    if (typeof error === "string" && error) {
      return redirectOutcome(request, "denied");
    }
    if (typeof code !== "string" || !code) {
      throw new Error("Calendar OAuth code is missing.");
    }

    const provider = getCalendarProvider(payload.provider);
    const configuration = getOAuthConfiguration(provider.id);
    const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    if (
      !configuration.clientId ||
      !configuration.clientSecret ||
      !tokenEncryptionKey
    ) {
      throw new Error(configuration.missingError);
    }

    const isLocalOrTest =
      process.env.APP_ENV === "local" || process.env.APP_ENV === "test";
    const overrideUrl = process.env.LOCAL_PROVIDER_OVERRIDE_URL;
    const fetchImpl =
      isLocalOrTest &&
      process.env.CALENDAR_PROVIDER_MODE === "mock" &&
      overrideUrl
        ? createProviderFetchImpl(fetch, overrideUrl)
        : fetch;
    const result = await completeClaimedCalendarConnection({
      provider,
      repository,
      connection: claimed,
      baseUrl: process.env.APP_PUBLIC_URL ?? new URL(request.url).origin,
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      code,
      codeVerifier: payload.codeVerifier,
      fetchImpl,
      tokenEncryptionKey,
    });

    return redirectOutcome(
      request,
      result.status === "unsupported" ? "unsupported" : "connected",
    );
  } catch {
    return redirectOutcome(request, "failed", requestId);
  }
}

function hashesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function safeRequestId(requestId: string): string {
  return /^[A-Za-z0-9_-]{1,100}$/.test(requestId) ? requestId : randomUUID();
}

function takeCallbackRateLimit(key: string, now: Date): boolean {
  const current = callbackRateLimits.get(key);
  if (!current || current.resetAt <= now.getTime()) {
    callbackRateLimits.set(key, {
      count: 1,
      resetAt: now.getTime() + CALLBACK_RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }
  if (current.count >= CALLBACK_RATE_LIMIT_MAX) {
    return false;
  }
  current.count += 1;
  return true;
}

export function resetCalendarOAuthCallbackRateLimitForTests(): void {
  callbackRateLimits.clear();
}

function redirectOutcome(
  request: Request,
  outcome: "connected" | "denied" | "unsupported" | "failed",
  requestId?: string,
  headers?: Record<string, string>,
): Response {
  const target = new URL(
    "/me/calendar-connections",
    process.env.APP_PUBLIC_URL ?? request.url,
  );
  target.searchParams.set("oauth", outcome);
  if (outcome === "failed" && requestId) {
    target.searchParams.set("requestId", requestId);
  }
  return new Response(null, {
    status: 303,
    headers: { Location: target.toString(), ...headers },
  });
}

function getOAuthConfiguration(
  provider: CalendarProviderId,
): OAuthConfiguration {
  return {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      missingError: "google_oauth_not_configured",
    },
    microsoft: {
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      missingError: "microsoft_oauth_not_configured",
    },
  }[provider];
}
