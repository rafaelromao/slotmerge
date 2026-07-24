const MICROSOFT_AUTHORIZATION_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";
const MICROSOFT_CALENDAR_SCOPES = "offline_access Calendars.ReadBasic";

export type MicrosoftCalendarAuthorizationUrlInput = {
  baseUrl: string;
  clientId: string;
  codeChallenge: string;
  state: string;
};

export function buildMicrosoftCalendarAuthorizationUrl({
  baseUrl,
  clientId,
  codeChallenge,
  state,
}: MicrosoftCalendarAuthorizationUrlInput): string {
  const mockBrowserUrl = process.env.LOCAL_PROVIDER_BROWSER_URL;
  const useMock =
    (process.env.APP_ENV === "local" || process.env.APP_ENV === "test") &&
    process.env.CALENDAR_PROVIDER_MODE === "mock" &&
    Boolean(mockBrowserUrl);
  const url = useMock
    ? new URL("/microsoft/authorize", mockBrowserUrl)
    : new URL(MICROSOFT_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set(
    "redirect_uri",
    new URL("/me/calendar-connections/callback", baseUrl).toString(),
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_CALENDAR_SCOPES);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return url.toString();
}

export function getMicrosoftCalendarScopes(): string {
  return MICROSOFT_CALENDAR_SCOPES;
}
