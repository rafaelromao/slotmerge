import {
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "./repository";
import {
  triggerCalendarActionRequiredEmail,
  type CalendarActionRequiredReason,
  type TriggerCalendarActionRequiredEmailResult,
} from "./action-required-email";
import { getConnectionActionRequiredDispatchLookup } from "./action-required-email.repository";
import { getEmailDeliveryService } from "./action-required-email-singleton";
import { loadRuntimeConfig } from "../config/runtime";

export type RecordCalendarConnectionSyncFailureInput = {
  connectionId: string;
  provider: "google" | "microsoft";
  code: string;
  message: string;
};

export type CalendarConnectionUserLookup = {
  (connectionId: string): Promise<{
    id: string;
    userId: string;
    provider: "google" | "microsoft";
    user: { email: string; displayName: string | null };
  } | null>;
};

type Recorder = (
  input: RecordCalendarConnectionSyncFailureInput,
  deps: { connectionLookup: CalendarConnectionUserLookup },
) => Promise<
  TriggerCalendarActionRequiredEmailResult | { status: "failed"; error: string }
>;

let recorderOverride: Recorder | null = null;

export function setRecordCalendarConnectionSyncFailureForTests(
  recorder: Recorder | null,
) {
  recorderOverride = recorder;
}

export const recordCalendarConnectionSyncFailure: Recorder = async (
  input,
  deps,
) => {
  if (recorderOverride) {
    return recorderOverride(input, deps);
  }
  return defaultRecordCalendarConnectionSyncFailure(input, deps);
};

const defaultRecordCalendarConnectionSyncFailure: Recorder = async (
  input,
  deps,
) => {
  const connection = await deps.connectionLookup(input.connectionId);
  if (!connection) {
    return { status: "failed", error: "calendar_connection_not_found" };
  }

  try {
    await updateConnectionErrorMetadata(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", error: message };
  }

  return triggerCalendarActionRequiredEmail(
    {
      connection: {
        id: connection.id,
        userId: connection.userId,
        provider: connection.provider,
        user: connection.user,
        baseUrl: loadRuntimeConfig().appPublicUrl,
        occurredAt: new Date(),
      },
      reason: "sync-failure" satisfies CalendarActionRequiredReason,
    },
    {
      emailDeliveryService: getEmailDeliveryService(),
      lastDispatchLookup: getConnectionActionRequiredDispatchLookup(),
    },
  );
};

async function updateConnectionErrorMetadata(
  input: RecordCalendarConnectionSyncFailureInput,
): Promise<void> {
  const needsReconnect =
    input.code === "invalid_grant" || input.code === "token_revoked";

  if (input.provider === "google") {
    await getGoogleCalendarConnectionRepository().updateById(
      input.connectionId,
      {
        lastErrorCode: input.code,
        lastErrorMessage: input.message,
        ...(needsReconnect ? { status: "needs_reconnect" } : {}),
      },
    );
    return;
  }
  await getMicrosoftCalendarConnectionRepository().updateById(
    input.connectionId,
    {
      lastErrorCode: input.code,
      lastErrorMessage: input.message,
      ...(needsReconnect ? { status: "needs_reconnect" } : {}),
    },
  );
}
