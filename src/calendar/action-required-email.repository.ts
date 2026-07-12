import { and, desc, eq, gte } from "drizzle-orm";

import { getDb } from "../db/client";
import { emailEvents } from "../db/schema";
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
  return {
    async findMostRecentConnectionDispatch(connectionId, reason, since) {
      const reference = createConnectionActionRequiredDedupReference(
        connectionId,
        reason,
      );

      const rows = await db
        .select({ createdAt: emailEvents.createdAt })
        .from(emailEvents)
        .where(
          and(
            eq(emailEvents.type, "calendar-action-required"),
            eq(emailEvents.payloadReference, reference),
            gte(emailEvents.createdAt, since),
          ),
        )
        .orderBy(desc(emailEvents.createdAt))
        .limit(1);

      const firstRow = rows[0];
      return firstRow ? firstRow.createdAt : null;
    },
  };
}

let postgresConnectionActionRequiredDispatchLookup: CalendarActionRequiredDispatchLookup | null =
  null;
