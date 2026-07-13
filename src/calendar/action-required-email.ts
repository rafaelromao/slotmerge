import { createHash } from "node:crypto";

import type { EmailDeliveryService, EmailPayload } from "../email/service";

export type CalendarActionRequiredReason = "token-revoked" | "sync-failure";

export type CalendarConnectionActionContext = {
  id: string;
  userId: string;
  provider: "google" | "microsoft";
  user: { email: string; displayName: string | null };
  baseUrl: string;
  occurredAt: Date;
};

export type CalendarActionRequiredDispatchLookup = {
  findMostRecentConnectionDispatch(
    connectionId: string,
    reason: CalendarActionRequiredReason,
    since: Date,
  ): Promise<Date | null>;
};

export type TriggerCalendarActionRequiredEmailInput = {
  connection: CalendarConnectionActionContext;
  reason: CalendarActionRequiredReason;
};

export type TriggerCalendarActionRequiredEmailDeps = {
  emailDeliveryService: Pick<EmailDeliveryService, "sendEmail">;
  lastDispatchLookup: CalendarActionRequiredDispatchLookup;
  clock?: () => Date;
  dedupWindowMs?: number;
};

export type TriggerCalendarActionRequiredEmailResult =
  | { status: "sent"; emailEventId: string; skipped: false }
  | { status: "skipped"; skipped: true }
  | { status: "failed"; skipped: false; error: string };

export type CalendarActionRequiredEmailPayload = {
  reason: CalendarActionRequiredReason;
  connectionId: string;
  provider: "google" | "microsoft";
  reconnectUrl: string;
  occurredAt: string;
};

const defaultDedupWindowMs = 60 * 60 * 1000;

export function createConnectionActionRequiredDedupReference(
  connectionId: string,
  reason: CalendarActionRequiredReason,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ connectionId, reason }))
    .digest("hex");
}

export function buildCalendarActionRequiredPayload({
  connection,
  reason,
}: TriggerCalendarActionRequiredEmailInput): CalendarActionRequiredEmailPayload {
  const reconnectUrl = buildReconnectUrl(connection.baseUrl);
  return {
    reason,
    connectionId: connection.id,
    provider: connection.provider,
    reconnectUrl,
    occurredAt: connection.occurredAt.toISOString(),
  };
}

export function buildReconnectUrl(baseUrl: string): string {
  return new URL("/me/calendar-connections", baseUrl).toString();
}

export async function triggerCalendarActionRequiredEmail(
  input: TriggerCalendarActionRequiredEmailInput,
  deps: TriggerCalendarActionRequiredEmailDeps,
): Promise<TriggerCalendarActionRequiredEmailResult> {
  const clock = deps.clock ?? (() => new Date());
  const dedupWindowMs = deps.dedupWindowMs ?? defaultDedupWindowMs;
  const now = clock();

  const since = new Date(now.getTime() - dedupWindowMs);
  const priorDispatch =
    await deps.lastDispatchLookup.findMostRecentConnectionDispatch(
      input.connection.id,
      input.reason,
      since,
    );

  if (priorDispatch !== null && priorDispatch.getTime() >= since.getTime()) {
    return { status: "skipped", skipped: true };
  }

  const payload = buildCalendarActionRequiredPayload(input);
  const payloadReference = createConnectionActionRequiredDedupReference(
    input.connection.id,
    input.reason,
  );
  const emailPayload: EmailPayload = {
    ...payload,
    recipientEmail: input.connection.user.email,
    recipientDisplayName: input.connection.user.displayName,
  };

  try {
    const { emailEvent } = await deps.emailDeliveryService.sendEmail({
      recipient: input.connection.user.email,
      type: "calendar-action-required",
      payload: emailPayload,
      payloadReference,
    });
    return {
      status: "sent",
      emailEventId: emailEvent.id,
      skipped: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      skipped: false,
      error: message,
    };
  }
}
