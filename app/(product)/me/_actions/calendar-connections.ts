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
  return isLocalOrTest && overrideUrl
    ? createProviderFetchImpl(fetch, overrideUrl)
    : fetch;
}

async function runSave(args: {
  formData: FormData;
  session: Session;
}): Promise<void> {
  const { formData, session } = args;
  const connectionId = extractFieldString(formData, "connectionId");
  if (!connectionId) {
    redirect(buildErrorRedirect("save", "missing_connection"));
  }
  const calendarIds = extractFieldStrings(formData, "calendarIds");

  const repository = getCalendarConnectionRepository();
  const connection = await repository.findById(connectionId);
  if (!connection || connection.userId !== session.user.id) {
    redirect(buildErrorRedirect("save", "forbidden", connectionId));
  }

  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncryptionKey || !connection.accessTokenEncrypted) {
    redirect(
      buildErrorRedirect("save", "missing_calendar_token", connectionId),
    );
  }

  const provider = getCalendarProvider(connection.provider);
  const accessToken = decryptCalendarToken({
    ciphertext: connection.accessTokenEncrypted,
    key: tokenEncryptionKey,
  });
  const fetchImpl = providerFetchImpl();

  const providerCalendars =
    connection.provider === "google"
      ? [{ id: "primary", name: "Primary calendar", isPrimary: true }]
      : await listProviderCalendarsForProvider(
          provider,
          accessToken,
          fetchImpl,
        );

  const validIds = new Set(providerCalendars.map((c) => c.id));
  const filtered = calendarIds.filter((id) => validIds.has(id));
  if (filtered.length === 0) {
    const primary = providerCalendars.find((c) => c.isPrimary);
    filtered.push(
      primary ? primary.id : (providerCalendars[0]?.id ?? "primary"),
    );
  }

  try {
    await repository.updateById(connectionId, {
      contributingCalendarIds: filtered,
    });
  } catch {
    redirect(
      buildErrorRedirect("save", "provider_request_failed", connectionId),
    );
  }

  redirect(
    `/me/calendar-connections?oauth=connected&connectionId=${encodeURIComponent(connectionId)}`,
  );
}

async function runRefresh(args: {
  formData: FormData;
  session: Session;
}): Promise<void> {
  const { formData, session } = args;
  const connectionId = extractFieldString(formData, "connectionId");
  if (!connectionId) {
    redirect(buildErrorRedirect("refresh", "missing_connection"));
  }
  const repository = getCalendarConnectionRepository();
  const connection = await repository.findById(connectionId);
  if (!connection || connection.userId !== session.user.id) {
    redirect(buildErrorRedirect("refresh", "forbidden", connectionId));
  }
  const config = loadRuntimeConfig();
  try {
    await enqueueSyncCalendarConnectionJob(connectionId, config.databaseUrl);
  } catch {
    redirect(buildErrorRedirect("refresh", "enqueue_failed", connectionId));
  }
  redirect("/me/calendar-connections?refreshed=1");
}

async function runDisconnect(args: {
  formData: FormData;
  session: Session;
}): Promise<void> {
  const { formData, session } = args;
  const connectionId = extractFieldString(formData, "connectionId");
  if (!connectionId) {
    redirect(buildErrorRedirect("disconnect", "missing_connection"));
  }
  const confirmAccountIdentifier = extractFieldString(
    formData,
    "confirmAccountIdentifier",
  );
  const repository = getCalendarConnectionRepository();
  const connection = await repository.findById(connectionId);
  if (!connection || connection.userId !== session.user.id) {
    redirect(buildErrorRedirect("disconnect", "forbidden", connectionId));
  }
  const expected = connection.accountIdentifier ?? "";
  if (confirmAccountIdentifier !== expected) {
    redirect(
      buildErrorRedirect("disconnect", "invalid_confirmation", connectionId),
    );
  }
  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!tokenEncryptionKey) {
    redirect(
      buildErrorRedirect(
        "disconnect",
        "missing_oauth_configuration",
        connectionId,
      ),
    );
  }
  const provider = getCalendarProvider(connection.provider);
  const fetchImpl = providerFetchImpl();
  try {
    await revokeCalendarConnection({
      provider,
      repository,
      connectionId,
      fetchImpl,
      tokenEncryptionKey,
    });
  } catch {
    await repository.updateById(connectionId, {
      status: "disconnected",
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
    });
  }
  redirect("/me/calendar-connections?oauth=disconnected");
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
  redirect("/me/calendar-connections");
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
