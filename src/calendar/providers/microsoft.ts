import { fetchMicrosoftFreeBusy } from "../freebusy/microsoft";
import {
  buildMicrosoftCalendarAuthorizationUrl,
  getMicrosoftCalendarScopes,
} from "../microsoft-oauth";
import type { CalendarProvider, CalendarProviderCompletion } from "../provider";

const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

export const microsoftCalendarProvider: CalendarProvider = {
  id: "microsoft",
  accountIdPrefix: "microsoft",
  authorizationScopes: getMicrosoftCalendarScopes(),
  buildAuthorizationUrl: buildMicrosoftCalendarAuthorizationUrl,
  completeAuthorization: completeMicrosoftAuthorization,
  revoke: () =>
    Promise.reject(new Error("Microsoft revoke is not implemented.")),
  fetchFreeBusy: fetchMicrosoftFreeBusy,
};

async function completeMicrosoftAuthorization({
  baseUrl,
  clientId,
  clientSecret,
  code,
  codeVerifier,
  fetchImpl,
}: Parameters<
  CalendarProvider["completeAuthorization"]
>[0]): Promise<CalendarProviderCompletion> {
  const response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      scope: getMicrosoftCalendarScopes(),
      redirect_uri: new URL(
        "/me/calendar-connections/callback",
        baseUrl,
      ).toString(),
    }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: string;
      error_description?: string;
    } | null;
    if (
      error?.error === "access_denied" &&
      error.error_description?.toLowerCase().includes("personal")
    ) {
      return {
        kind: "unsupported",
        reason: "unsupported_microsoft_account",
      };
    }
    throw new Error("Microsoft token exchange failed.");
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Microsoft token response did not include tokens.");
  }

  const primaryCalendarId = await getMicrosoftPrimaryCalendarId(
    payload.access_token,
    fetchImpl,
  );
  if (!primaryCalendarId) {
    throw new Error(
      "Could not determine the primary calendar for the Microsoft account. Please try again.",
    );
  }

  return {
    kind: "connected",
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessTokenExpiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null,
    scopes: payload.scope ?? getMicrosoftCalendarScopes(),
    contributingCalendarIds: [primaryCalendarId],
  };
}

async function getMicrosoftPrimaryCalendarId(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(
      `${MICROSOFT_GRAPH_ENDPOINT}/me/calendars?$filter=isPrimaryCalendar eq true&$top=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      value?: Array<{ id: string; isPrimaryCalendar?: boolean }>;
    };
    return (
      data.value?.find((calendar) => calendar.isPrimaryCalendar === true)?.id ??
      null
    );
  } catch {
    return null;
  }
}
