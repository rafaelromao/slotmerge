import { getDb } from "../db/client";
import { createPostgresEmailDedupLookup } from "../email/dedup.repository";
import {
  createConnectionActionRequiredDedupReference,
  type CalendarActionRequiredDispatchLookup,
} from "./action-required-email";

let dispatchLookupOverride: CalendarActionRequiredDispatchLookup | null = null;

export function setConnectionActionRequiredDispatchLookupForTests(
  lookup: CalendarActionRequiredDispatchLookup | null,
) {
  dispatchLookupOverride = lookup;
}

export function getConnectionActionRequiredDispatchLookup(): CalendarActionRequiredDispatchLookup {
  if (dispatchLookupOverride) {
    return dispatchLookupOverride;
  }
  if (!postgresConnectionActionRequiredDispatchLookup) {
    postgresConnectionActionRequiredDispatchLookup =
      createPostgresConnectionActionRequiredDispatchLookup();
  }
  return postgresConnectionActionRequiredDispatchLookup;
}

export function createPostgresConnectionActionRequiredDispatchLookup(
  db = getDb(),
): CalendarActionRequiredDispatchLookup {
  const lookup = createPostgresEmailDedupLookup(db);

  return {
    async findMostRecentConnectionDispatch(connectionId, reason, since) {
      return lookup.findMostRecent({
        type: "calendar-action-required",
        payloadReference: createConnectionActionRequiredDedupReference(
          connectionId,
          reason,
        ),
        since,
        status: "sent",
      });
    },
  };
}

let postgresConnectionActionRequiredDispatchLookup: CalendarActionRequiredDispatchLookup | null =
  null;
