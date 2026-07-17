import type { CalendarProvider as CalendarProviderId } from "../../db/schema";
import type { CalendarProvider } from "../provider";
import { googleCalendarProvider } from "./google";
import { microsoftCalendarProvider } from "./microsoft";

const providers: Record<CalendarProviderId, CalendarProvider> = {
  google: googleCalendarProvider,
  microsoft: microsoftCalendarProvider,
};

export function getCalendarProvider(id: CalendarProviderId): CalendarProvider {
  return providers[id];
}

export { googleCalendarProvider, microsoftCalendarProvider };
