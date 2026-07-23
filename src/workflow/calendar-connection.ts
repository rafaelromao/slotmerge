import {
  buildCalendarConnectionHealthFields,
  type CalendarConnectionHealthStatus,
} from "../calendar/calendar-connection-health";
import {
  startCalendarConnection,
  type CalendarConnectionRecord,
  type CalendarConnectionRepository,
} from "../calendar/connection";
import {
  getCalendarProvider,
  type ProviderCalendar,
} from "../calendar/providers";
import type { CalendarProvider as CalendarProviderId } from "../db/schema";
import { err, ok, type Result } from "../lib/result";
import type { Clock } from "../system/clock";

export type CalendarConnectionDisplayStatus =
  "connected" | "sync_delayed" | "needs_reconnect" | "unsupported" | "failed";

export type CalendarConnectionPageCalendar = ProviderCalendar & {
  selected: boolean;
};

export type CalendarConnectionPageItem = {
  id: string;
  provider: "google" | "microsoft";
  accountIdentifier: string | null;
  displayStatus: CalendarConnectionDisplayStatus;
  lastSyncAt: Date | null;
  stale: boolean;
  calendars: CalendarConnectionPageCalendar[];
  calendarsError: boolean;
};

export type CalendarConnectionPageState = {
  connections: CalendarConnectionPageItem[];
};

export type CalendarConnectionError = {
  code: "load_failed" | "oauth_not_configured" | "oauth_start_failed";
};

export type CalendarConnectionWorkflow = {
  loadPage(input: {
    userId: string;
  }): Promise<Result<CalendarConnectionPageState, CalendarConnectionError>>;
  startOAuth(input: {
    userId: string;
    provider: CalendarProviderId;
    connectionId?: string;
  }): Promise<
    Result<
      { authorizeUrl: string; connectionId: string },
      CalendarConnectionError
    >
  >;
};

export type CalendarConnectionOAuthDependencies = {
  baseUrl: string;
  clientIds: Record<CalendarProviderId, string | undefined>;
  csrfToken: string;
  sessionId: string;
  sessionSecret: string;
  generateId?: () => string;
};

export type CreateCalendarConnectionWorkflowDeps = {
  repository: CalendarConnectionRepository;
  clock: Clock;
  listProviderCalendars: (
    connection: CalendarConnectionRecord,
  ) => Promise<ProviderCalendar[]>;
  oauth?: CalendarConnectionOAuthDependencies;
};

function displayStatus(
  connection: CalendarConnectionRecord,
  healthStatus: CalendarConnectionHealthStatus,
): CalendarConnectionDisplayStatus {
  if (connection.status === "unsupported") {
    return "unsupported";
  }

  if (
    connection.status === "needs_reconnect" ||
    connection.lastErrorCode === "invalid_grant" ||
    connection.lastErrorCode === "token_revoked" ||
    connection.lastErrorCode === "AUTH_ERROR"
  ) {
    return "needs_reconnect";
  }

  if (
    connection.lastErrorCode &&
    connection.lastErrorCode !== "invalid_grant" &&
    connection.lastErrorCode !== "token_revoked" &&
    connection.lastErrorCode !== "AUTH_ERROR"
  ) {
    return "failed";
  }

  if (connection.status === "sync_delayed") {
    return "sync_delayed";
  }

  if (healthStatus === "disconnected") {
    return "failed";
  }

  return healthStatus;
}

export function createCalendarConnectionWorkflow(
  deps: CreateCalendarConnectionWorkflowDeps,
): CalendarConnectionWorkflow {
  return {
    async loadPage({ userId }) {
      try {
        const records = await deps.repository.listByUserId(userId);
        const visible = records.filter(
          (connection) =>
            connection.userId === userId &&
            connection.status !== "pending" &&
            connection.status !== "disconnected",
        );
        const now = deps.clock.now();
        const connections = await Promise.all(
          visible.map(async (connection) => {
            let calendars: ProviderCalendar[] = [];
            let calendarsError = false;
            try {
              calendars = await deps.listProviderCalendars(connection);
            } catch {
              calendarsError = true;
            }
            const selectedIds =
              connection.contributingCalendarIds.length > 0
                ? new Set(connection.contributingCalendarIds)
                : new Set(
                    calendars
                      .filter((calendar) => calendar.isPrimary)
                      .map((calendar) => calendar.id),
                  );
            const health = buildCalendarConnectionHealthFields(connection, now);

            return {
              id: connection.id,
              provider: connection.provider,
              accountIdentifier: connection.accountIdentifier,
              displayStatus: displayStatus(connection, health.healthStatus),
              lastSyncAt: health.lastSyncAt,
              stale: health.stale,
              calendars: calendars.map((calendar) => ({
                ...calendar,
                selected: selectedIds.has(calendar.id),
              })),
              calendarsError,
            };
          }),
        );

        return ok({ connections });
      } catch {
        return err({ code: "load_failed" });
      }
    },

    async startOAuth({ userId, provider, connectionId }) {
      const oauth = deps.oauth;
      const clientId = oauth?.clientIds[provider];
      if (!oauth || !clientId) {
        return err({ code: "oauth_not_configured" });
      }
      if (connectionId && !deps.repository.replaceWithPending) {
        return err({ code: "oauth_start_failed" });
      }

      try {
        const repository = connectionId
          ? {
              ...deps.repository,
              createPending: (pending: CalendarConnectionRecord) =>
                deps.repository.replaceWithPending!({
                  previousId: connectionId,
                  userId,
                  provider,
                  pending,
                }),
            }
          : deps.repository;
        const started = await startCalendarConnection({
          provider: getCalendarProvider(provider),
          repository,
          baseUrl: oauth.baseUrl,
          clientId,
          csrfToken: oauth.csrfToken,
          sessionId: oauth.sessionId,
          clock: deps.clock,
          generateId: oauth.generateId,
          sessionSecret: oauth.sessionSecret,
          userId,
        });

        return ok({
          authorizeUrl: started.authorizationUrl,
          connectionId: started.connection.id,
        });
      } catch {
        return err({ code: "oauth_start_failed" });
      }
    },
  };
}
