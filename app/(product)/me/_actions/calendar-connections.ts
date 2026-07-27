"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getSessionFromRequest,
  type Session,
} from "../../../../src/auth/session";
import { getCalendarConnectionRepository } from "../../../../src/calendar/repository";
import { getCalendarProvider } from "../../../../src/calendar/providers";
import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { enqueueSyncCalendarConnectionJob } from "../../../../src/worker/sync";
import { revokeCalendarConnection } from "../../../../src/calendar/connection";
import { decryptCalendarToken } from "../../../../src/calendar/token-encryption";
import { createProviderFetchImpl } from "../../../../src/lib/fetch-wrapper";
import { CsrfError, assertCsrfFromFormData } from "../../../../src/lib/csrf";
import { listProviderCalendarsForProvider } from "../../../../src/calendar/providers";
import { systemClock } from "../../../../src/system/clock";
import {
  createCalendarConnectionWorkflow,
  type CalendarConnectionMutationError,
} from "../../../../src/workflow/calendar-connection";

export type CalendarConnectionFormIntent = "save" | "refresh" | "disconnect";

export type CalendarConnectionFormErrorCode =
  | "csrf_error"
  | "missing_connection"
  | "forbidden"
  | "missing_calendar_token"
  | "missing_oauth_configuration"
  | "provider_request_failed"
  | "enqueue_failed"
  | "invalid_confirmation"
  | "invalid_provider"
  | "invalid_input";

function extractFieldString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function extractFieldStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

function buildRequest(
  url: string,
  headersObject: Record<string, string>,
): Request {
  return new Request(url, {
    method: "POST",
    headers: headersObject,
  });
}

function buildErrorRedirect(
  intent: CalendarConnectionFormIntent,
  code: CalendarConnectionFormErrorCode,
  connectionId?: string,
): string {
  const params = new URLSearchParams({ intent });
  params.set("error", code);
  if (connectionId) {
    params.set("connectionId", connectionId);
  }
  return `/me/calendar-connections?${params.toString()}`;
}

async function loadSessionForRequest(
  request: Request,
): Promise<Session | null> {
  return getSessionFromRequest(request);
}

async function loadCurrentRequest(): Promise<{
  request: Request;
  headersObject: Record<string, string>;
  origin: string;
}> {
  const headerList = await headers();
  const headersObject: Record<string, string> = {};
  headerList.forEach((value, key) => {
    headersObject[key] = value;
  });
  const request = buildRequest(
    "http://localhost/me/calendar-connections",
    headersObject,
  );
  const origin = headersObject["origin"] ?? new URL(request.url).origin;
  return { request, headersObject, origin };
}

function expectedAppOrigin(): string | null {
  try {
    return new URL(loadRuntimeConfig().appPublicUrl).origin;
  } catch {
    return null;
  }
}

function providerFetchImpl(): typeof fetch {
  const isLocalOrTest =
    process.env.APP_ENV === "local" || process.env.APP_ENV === "test";
  const overrideUrl = process.env.LOCAL_PROVIDER_OVERRIDE_URL;
  return isLocalOrTest &&
    process.env.CALENDAR_PROVIDER_MODE === "mock" &&
    overrideUrl
    ? createProviderFetchImpl(fetch, overrideUrl)
    : fetch;
}

function createMutationWorkflow() {
  const repository = getCalendarConnectionRepository();
  return createCalendarConnectionWorkflow({
    repository,
    clock: systemClock(),
    listProviderCalendars: async (connection) => {
      const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
      if (!tokenEncryptionKey || !connection.accessTokenEncrypted) {
        throw new Error("Calendar provider token is unavailable");
      }
      const accessToken = decryptCalendarToken({
        ciphertext: connection.accessTokenEncrypted,
        key: tokenEncryptionKey,
      });
      return listProviderCalendarsForProvider(
        getCalendarProvider(connection.provider),
        accessToken,
        providerFetchImpl(),
      );
    },
    enqueueRefresh: async (connectionId) => {
      await enqueueSyncCalendarConnectionJob(
        connectionId,
        loadRuntimeConfig().databaseUrl,
      );
    },
    revokeConnection: async (connection) => {
      const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
      if (!tokenEncryptionKey) {
        throw new Error("Calendar OAuth is not configured");
      }
      await revokeCalendarConnection({
        provider: getCalendarProvider(connection.provider),
        repository,
        connectionId: connection.id,
        fetchImpl: providerFetchImpl(),
        tokenEncryptionKey,
      });
    },
  });
}

function mutationErrorCode(
  error: CalendarConnectionMutationError,
): CalendarConnectionFormErrorCode {
  return {
    not_found: "forbidden",
    invalid_calendars: "invalid_input",
    provider_unavailable: "provider_request_failed",
    enqueue_failed: "enqueue_failed",
    invalid_confirmation: "invalid_confirmation",
    disconnect_failed: "provider_request_failed",
  }[error.code] as CalendarConnectionFormErrorCode;
}

async function runSave(args: {
  formData: FormData;
  session: Session;
}): Promise<void> {
  const connectionId = extractFieldString(args.formData, "connectionId");
  if (!connectionId) {
    redirect(buildErrorRedirect("save", "missing_connection"));
  }
  const result = await createMutationWorkflow().mutateConnection({
    kind: "save",
    userId: args.session.user.id,
    connectionId,
    calendarIds: extractFieldStrings(args.formData, "calendarIds"),
  });
  if (!result.ok) {
    redirect(
      buildErrorRedirect("save", mutationErrorCode(result.error), connectionId),
    );
  }
  redirect(
    `/me/calendar-connections?intent=save&success=1&connectionId=${encodeURIComponent(connectionId)}`,
  );
}

async function runRefresh(args: {
  formData: FormData;
  session: Session;
}): Promise<void> {
  const connectionId = extractFieldString(args.formData, "connectionId");
  if (!connectionId) {
    redirect(buildErrorRedirect("refresh", "missing_connection"));
  }
  const result = await createMutationWorkflow().mutateConnection({
    kind: "refresh",
    userId: args.session.user.id,
    connectionId,
  });
  if (!result.ok) {
    redirect(
      buildErrorRedirect(
        "refresh",
        mutationErrorCode(result.error),
        connectionId,
      ),
    );
  }
  redirect(
    `/me/calendar-connections?intent=refresh&success=1&connectionId=${encodeURIComponent(connectionId)}`,
  );
}

async function runDisconnect(args: {
  formData: FormData;
  session: Session;
}): Promise<void> {
  const connectionId = extractFieldString(args.formData, "connectionId");
  if (!connectionId) {
    redirect(buildErrorRedirect("disconnect", "missing_connection"));
  }
  const result = await createMutationWorkflow().mutateConnection({
    kind: "disconnect",
    userId: args.session.user.id,
    connectionId,
    confirmAccountIdentifier:
      extractFieldString(args.formData, "confirmAccountIdentifier") ?? "",
  });
  if (!result.ok) {
    redirect(
      buildErrorRedirect(
        "disconnect",
        mutationErrorCode(result.error),
        connectionId,
      ),
    );
  }
  redirect("/me/calendar-connections?intent=disconnect&success=1");
}

async function runDispatch(args: {
  formData: FormData;
  intent: CalendarConnectionFormIntent;
  origin: string;
}): Promise<void> {
  const { formData, intent } = args;
  const session = await loadSessionForRequest(await buildRequestProxy());
  if (!session) {
    redirect("/sign-in");
  }

  try {
    assertCsrfFromFormData(formData, session);
  } catch (error) {
    if (error instanceof CsrfError) {
      redirect(buildErrorRedirect(intent, "csrf_error"));
    }
    throw error;
  }

  const expectedOrigin = expectedAppOrigin();
  if (expectedOrigin && args.origin !== expectedOrigin) {
    redirect(buildErrorRedirect(intent, "csrf_error"));
  }

  if (intent === "save") {
    await runSave({ formData, session });
  } else if (intent === "refresh") {
    await runRefresh({ formData, session });
  } else {
    await runDisconnect({ formData, session });
  }
}

async function buildRequestProxy(): Promise<Request> {
  const { request } = await loadCurrentRequest();
  return request;
}

export async function saveCalendarsAction(formData: FormData): Promise<void> {
  const { origin } = await loadCurrentRequest();
  await runDispatch({ formData, intent: "save", origin });
}

export async function refreshConnectionAction(
  formData: FormData,
): Promise<void> {
  const { origin } = await loadCurrentRequest();
  await runDispatch({ formData, intent: "refresh", origin });
}

export async function disconnectConnectionAction(
  formData: FormData,
): Promise<void> {
  const { origin } = await loadCurrentRequest();
  await runDispatch({ formData, intent: "disconnect", origin });
}
