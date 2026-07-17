import { fetchGoogleFreeBusy } from "../freebusy/google";
import {
  buildGoogleCalendarAuthorizationUrl,
  getGoogleFreeBusyScope,
} from "../google-oauth";
import type { CalendarProvider, CalendarProviderCompletion } from "../provider";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const googleCalendarProvider: CalendarProvider = {
  id: "google",
  accountIdPrefix: "google",
  authorizationScopes: getGoogleFreeBusyScope(),
  buildAuthorizationUrl: buildGoogleCalendarAuthorizationUrl,
  completeAuthorization: completeGoogleAuthorization,
  revoke: () => Promise.reject(new Error("Google revoke is not implemented.")),
  fetchFreeBusy: fetchGoogleFreeBusy,
};

async function completeGoogleAuthorization({
  baseUrl,
  clientId,
  clientSecret,
  code,
  codeVerifier,
  fetchImpl,
}: Parameters<
  CalendarProvider["completeAuthorization"]
>[0]): Promise<CalendarProviderCompletion> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: new URL(
        "/me/calendar-connections/callback",
        baseUrl,
      ).toString(),
    }),
  });

  if (!response.ok) {
    throw new Error("Google token exchange failed.");
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  if (!payload.access_token || !payload.refresh_token) {
    throw new Error("Google token response did not include tokens.");
  }

  return {
    kind: "connected",
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessTokenExpiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null,
    scopes: payload.scope ?? getGoogleFreeBusyScope(),
    contributingCalendarIds: ["primary"],
  };
}
