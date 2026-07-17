import { fetchMicrosoftFreeBusy } from "../freebusy/microsoft";
import {
  buildMicrosoftCalendarAuthorizationUrl,
  getMicrosoftCalendarScopes,
} from "../microsoft-oauth";
import type { CalendarProvider } from "../provider";

export const microsoftCalendarProvider: CalendarProvider = {
  id: "microsoft",
  accountIdPrefix: "microsoft",
  authorizationScopes: getMicrosoftCalendarScopes(),
  buildAuthorizationUrl: buildMicrosoftCalendarAuthorizationUrl,
  completeAuthorization: () =>
    Promise.reject(new Error("Microsoft completion is not implemented.")),
  revoke: () =>
    Promise.reject(new Error("Microsoft revoke is not implemented.")),
  fetchFreeBusy: fetchMicrosoftFreeBusy,
};
