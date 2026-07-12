import { scheduleCalendarConnectionSyncJobs } from "./sync-queue";
import type { CalendarConnectionSyncRecord } from "./sync";
import type { EnqueueCalendarSyncJob } from "./sync-queue";

export async function handleCalendarWebhook(
  request: Request,
  {
    provider,
    expectedToken,
    listConnections,
    enqueueJob,
    seenNotifications = new Set<string>(),
    now = () => new Date(),
    random = Math.random,
  }: {
    provider: CalendarConnectionSyncRecord["provider"];
    expectedToken: string;
    listConnections: (
      provider: CalendarConnectionSyncRecord["provider"],
    ) => Promise<ReadonlyArray<CalendarConnectionSyncRecord>>;
    enqueueJob: EnqueueCalendarSyncJob;
    seenNotifications?: Set<string>;
    now?: () => Date;
    random?: () => number;
  },
): Promise<Response> {
  const incomingToken = request.headers.get("x-webhook-token");
  if (incomingToken !== expectedToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const notificationId = request.headers.get("x-webhook-notification-id");
  if (notificationId && seenNotifications.has(notificationId)) {
    return Response.json({ ignored: true }, { status: 202 });
  }

  if (notificationId) {
    seenNotifications.add(notificationId);
  }

  const connections = await listConnections(provider);
  await scheduleCalendarConnectionSyncJobs({
    connections,
    enqueueJob,
    now: now(),
    random,
    source: "webhook",
  });

  return Response.json({ enqueued: connections.length }, { status: 202 });
}
