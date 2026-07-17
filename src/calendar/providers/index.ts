import type { CalendarProvider as CalendarProviderId } from "../../db/schema";
import type { CalendarProvider } from "../provider";
import {
  GOOGLE_PRIMARY_CALENDAR,
  fetchMicrosoftProviderCalendars,
  type ProviderCalendar,
} from "./calendar-listing";
import { googleCalendarProvider } from "./google";
import { microsoftCalendarProvider } from "./microsoft";

const providers: Record<CalendarProviderId, CalendarProvider> = {
  google: googleCalendarProvider,
  microsoft: microsoftCalendarProvider,
};

export function getCalendarProvider(id: CalendarProviderId): CalendarProvider {
  return providers[id];
}

export {
  googleCalendarProvider,
  microsoftCalendarProvider,
  GOOGLE_PRIMARY_CALENDAR,
  fetchMicrosoftProviderCalendars,
};
export type { ProviderCalendar };

export async function listProviderCalendarsForProvider(
  provider: CalendarProvider,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<ProviderCalendar[]> {
  if (provider.id === "google") {
    return [GOOGLE_PRIMARY_CALENDAR];
  }

  return fetchMicrosoftProviderCalendars({ accessToken, fetchImpl });
}
