import type { CalendarProvider as CalendarProviderId } from "../db/schema";
import type { FreeBusyInterval } from "./freebusy/types";

export type CalendarProviderCompletion =
  | {
      kind: "connected";
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: Date | null;
      scopes: string;
      contributingCalendarIds: string[];
    }
  | { kind: "unsupported"; reason: string };

export type CalendarProvider = {
  id: CalendarProviderId;
  accountIdPrefix: string;
  authorizationScopes: string;
  buildAuthorizationUrl(input: {
    baseUrl: string;
    clientId: string;
    codeChallenge: string;
    state: string;
  }): string;
  completeAuthorization(input: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    fetchImpl: typeof fetch;
  }): Promise<CalendarProviderCompletion>;
  revoke(input: {
    refreshToken: string;
    fetchImpl: typeof fetch;
  }): Promise<void>;
  fetchFreeBusy(input: {
    accessToken: string;
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
    fetchImpl: typeof fetch;
  }): Promise<FreeBusyInterval[]>;
};
