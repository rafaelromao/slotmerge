import type { CalendarConnectionRecord } from "../../src/calendar/connection";
import { getCalendarProvider } from "../../src/calendar/providers";
import { getCalendarConnectionRepository } from "../../src/calendar/repository";
import { systemClock } from "../../src/system/clock";
import { createCalendarConnectionWorkflow } from "../../src/workflow/calendar-connection";

export type ListedConnection = {
  id: string;
  provider: "google" | "microsoft";
  accountIdentifier: string | null;
  displayStatus: string;
  lastSyncAt: Date | null;
  stale: boolean;
  calendars: ReadonlyArray<{
    id: string;
    name: string;
    isPrimary: boolean;
    selected: boolean;
  }>;
  calendarsError: boolean;
};

export async function listConnectionsForTests(
  userId: string,
  listProviderCalendars: (
    connection: CalendarConnectionRecord,
  ) => Promise<ListedConnection["calendars"][number][]> = () =>
    Promise.resolve([]),
): Promise<{
  connections: ListedConnection[];
}> {
  const workflow = createCalendarConnectionWorkflow({
    repository: getCalendarConnectionRepository(),
    clock: systemClock(),
    listProviderCalendars,
  });
  const result = await workflow.loadPage({ userId });
  if (!result.ok) {
    return { connections: [] };
  }
  return { connections: result.value.connections };
}

export { getCalendarProvider };
