const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_FREEBUSY_SCOPE =
  "https://www.googleapis.com/auth/calendar.freebusy";

export type GoogleCalendarAuthorizationUrlInput = {
  baseUrl: string;
  clientId: string;
  codeChallenge: string;
  state: string;
};

export function buildGoogleCalendarAuthorizationUrl({
  baseUrl,
  clientId,
  codeChallenge,
  state,
}: GoogleCalendarAuthorizationUrlInput): string {
  const mockBrowserUrl = process.env.LOCAL_PROVIDER_BROWSER_URL;
  const useMock =
    (process.env.APP_ENV === "local" || process.env.APP_ENV === "test") &&
    process.env.CALENDAR_PROVIDER_MODE === "mock" &&
    Boolean(mockBrowserUrl);
  const url = useMock
    ? new URL("/google/authorize", mockBrowserUrl)
    : new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set(
    "redirect_uri",
    new URL("/me/calendar-connections/callback", baseUrl).toString(),
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_FREEBUSY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return url.toString();
}

export function getGoogleFreeBusyScope(): string {
  return GOOGLE_FREEBUSY_SCOPE;
}
