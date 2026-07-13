import {
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "../calendar/repository";
import {
  processCalendarConnectionSync,
  type CalendarConnectionSyncRecord,
} from "../calendar/sync";
import { enqueueCalendarConnectionSyncJob } from "../calendar/sync-jobs";
import { reconcileCalendarConnections } from "../calendar/reconciliation";
import { createGoogleCalendarSyncClient } from "../calendar/google-calendar-sync";
import { createMicrosoftCalendarSyncClient } from "../calendar/microsoft-calendar-sync";
import { loadRuntimeConfig } from "../config/runtime";

export const calendarConnectionSyncTaskName = "calendar_connection_sync";
export const calendarConnectionReconcileTaskName =
  "calendar_connection_reconcile";

type CalendarConnectionSyncJobPayload = {
  connectionId: string;
  provider: CalendarConnectionSyncRecord["provider"];
  attempt: number;
  source: "webhook" | "reconciliation";
};

export async function handleCalendarConnectionSyncJob(
  payload: unknown,
): Promise<void> {
  const job = parseSyncJobPayload(payload);
  const config = loadRuntimeConfig();

  if (job.provider === "google") {
    const repository = getGoogleCalendarConnectionRepository();
    const connection = await repository.findById(job.connectionId);
    if (!connection) {
      throw new Error("Google calendar connection not found.");
    }

    await processCalendarConnectionSync({
      attempt: job.attempt,
      connection,
      connectionRepository: repository,
      importedBusyIntervalRepository: (
        await import("../calendar/imported-busy-intervals")
      ).getImportedBusyIntervalRepository(),
      now: new Date(),
      providerClient: createGoogleCalendarSyncClient({
        tokenEncryptionKey: config.calendarTokenEncryptionKey,
      }),
      scheduleRetry: (input) =>
        enqueueCalendarConnectionSyncJob({
          connectionId: input.connectionId,
          provider: "google",
          source: job.source,
          attempt: input.attempt,
          runAt: new Date(Date.now() + input.delayMs),
        }),
    });
    return;
  }

  const repository = getMicrosoftCalendarConnectionRepository();
  const connection = await repository.findById(job.connectionId);
  if (!connection) {
    throw new Error("Microsoft calendar connection not found.");
  }

  await processCalendarConnectionSync({
    attempt: job.attempt,
    connection,
    connectionRepository: repository,
    importedBusyIntervalRepository: (
      await import("../calendar/imported-busy-intervals")
    ).getImportedBusyIntervalRepository(),
    now: new Date(),
    providerClient: createMicrosoftCalendarSyncClient({
      tokenEncryptionKey: config.calendarTokenEncryptionKey,
    }),
    scheduleRetry: (input) =>
      enqueueCalendarConnectionSyncJob({
        connectionId: input.connectionId,
        provider: "microsoft",
        source: job.source,
        attempt: input.attempt,
        runAt: new Date(Date.now() + input.delayMs),
      }),
  });
}

export async function handleCalendarConnectionReconcileJob(
  payload: unknown,
): Promise<void> {
  const provider = parseReconcilePayload(payload);
  const random = Math.random;

  if (provider === "google") {
    await reconcileCalendarConnections({
      now: new Date(),
      random,
      listConnections: async () =>
        (
          await import("../calendar/repository")
        ).listConnectedCalendarConnectionsByProvider("google"),
      enqueueJob: enqueueCalendarConnectionSyncJob,
    });
    return;
  }

  await reconcileCalendarConnections({
    now: new Date(),
    random,
    listConnections: async () =>
      (
        await import("../calendar/repository")
      ).listConnectedCalendarConnectionsByProvider("microsoft"),
    enqueueJob: enqueueCalendarConnectionSyncJob,
  });
}

function parseSyncJobPayload(
  payload: unknown,
): CalendarConnectionSyncJobPayload {
  if (typeof payload === "object" && payload !== null) {
    const connectionId = (payload as { connectionId?: unknown }).connectionId;
    const provider = (payload as { provider?: unknown }).provider;

    if (
      typeof connectionId === "string" &&
      (provider === "google" || provider === "microsoft")
    ) {
      const attempt = Number((payload as { attempt?: unknown }).attempt);
      return {
        connectionId,
        provider,
        attempt: Number.isFinite(attempt) && attempt > 0 ? attempt : 1,
        source:
          (payload as { source?: unknown }).source === "webhook"
            ? "webhook"
            : "reconciliation",
      };
    }
  }

  throw new Error("calendar sync job requires a connectionId and provider");
}

function parseReconcilePayload(payload: unknown): "google" | "microsoft" {
  if (payload === "google" || payload === "microsoft") {
    return payload;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    ((payload as { provider?: unknown }).provider === "google" ||
      (payload as { provider?: unknown }).provider === "microsoft")
  ) {
    return (payload as { provider: "google" | "microsoft" }).provider;
  }

  throw new Error("calendar reconciliation job requires a provider");
}
