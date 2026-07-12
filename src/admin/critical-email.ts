import { createHash } from "node:crypto";

export type OperationalEventKind = string;

export type OperationalEvent = {
  kind: OperationalEventKind;
  summary: string;
  occurredAt: Date;
  details?: Record<string, unknown>;
};

export type CriticalEmailPayload = {
  kind: OperationalEventKind;
  summary: string;
  occurredAt: string;
  details?: Record<string, unknown>;
};

export type AdminDirectoryEntry = {
  id: string;
  email: string;
};

export type AdminDirectory = {
  listActiveAdmins(): Promise<AdminDirectoryEntry[]>;
};

export type AdminCriticalEmailDeliveryService = {
  sendEmail(input: {
    recipient: string;
    type: "admin-critical";
    payload: CriticalEmailPayload;
    payloadReference: string;
  }): Promise<{ emailEvent: { id: string } }>;
};

export type AdminCriticalDispatchLookup = {
  findMostRecentKindDispatch(
    kind: OperationalEventKind,
    since: Date,
  ): Promise<Date | null>;
};

export type TriggerAdminCriticalEmailInput = {
  event: OperationalEvent;
};

export type TriggerAdminCriticalEmailDeps = {
  adminDirectory: AdminDirectory;
  emailDeliveryService: AdminCriticalEmailDeliveryService;
  lastDispatchLookup: AdminCriticalDispatchLookup;
  clock?: () => Date;
  dedupWindowMs?: number;
};

export type CriticalEmailDeliveryResult =
  | { recipient: string; status: "sent"; emailEventId: string }
  | { recipient: string; status: "failed"; error: string };

export type TriggerAdminCriticalEmailResult = {
  deliveries: CriticalEmailDeliveryResult[];
};

const defaultDedupWindowMs = 15 * 60 * 1000;

export function createKindDedupReference(kind: OperationalEventKind): string {
  return createHash("sha256").update(JSON.stringify({ kind })).digest("hex");
}

export function toCriticalEmailPayload(
  event: OperationalEvent,
): CriticalEmailPayload {
  return {
    kind: event.kind,
    summary: event.summary,
    occurredAt: event.occurredAt.toISOString(),
    details: event.details,
  };
}

export async function triggerAdminCriticalEmail(
  input: TriggerAdminCriticalEmailInput,
  deps: TriggerAdminCriticalEmailDeps,
): Promise<TriggerAdminCriticalEmailResult> {
  const clock = deps.clock ?? (() => new Date());
  const dedupWindowMs = deps.dedupWindowMs ?? defaultDedupWindowMs;
  const now = clock();

  const admins = await deps.adminDirectory.listActiveAdmins();

  if (admins.length === 0) {
    return { deliveries: [] };
  }

  const since = new Date(now.getTime() - dedupWindowMs);
  const priorDispatch =
    await deps.lastDispatchLookup.findMostRecentKindDispatch(
      input.event.kind,
      since,
    );

  if (priorDispatch !== null) {
    return { deliveries: [] };
  }

  const payload = toCriticalEmailPayload(input.event);
  const payloadReference = createKindDedupReference(input.event.kind);
  const deliveries: CriticalEmailDeliveryResult[] = [];

  for (const admin of admins) {
    try {
      const { emailEvent } = await deps.emailDeliveryService.sendEmail({
        recipient: admin.email,
        type: "admin-critical",
        payload,
        payloadReference,
      });
      deliveries.push({
        recipient: admin.email,
        status: "sent",
        emailEventId: emailEvent.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deliveries.push({
        recipient: admin.email,
        status: "failed",
        error: message,
      });
    }
  }

  return { deliveries };
}
