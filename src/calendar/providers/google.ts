import { fetchGoogleFreeBusy } from "../freebusy/google";
import {
  buildGoogleCalendarAuthorizationUrl,
  getGoogleFreeBusyScope,
} from "../google-oauth";
import type { CalendarProvider } from "../provider";

export const googleCalendarProvider: CalendarProvider = {
  id: "google",
  accountIdPrefix: "google",
  authorizationScopes: getGoogleFreeBusyScope(),
  buildAuthorizationUrl: buildGoogleCalendarAuthorizationUrl,
  completeAuthorization: () =>
    Promise.reject(new Error("Google completion is not implemented.")),
  revoke: () => Promise.reject(new Error("Google revoke is not implemented.")),
  fetchFreeBusy: fetchGoogleFreeBusy,
};
