import { handleCalendarWebhook } from "../../../../src/calendar/webhook-handler";
import { enqueueCalendarConnectionSyncJob } from "../../../../src/calendar/sync-jobs";
import { listConnectedCalendarConnectionsByProvider } from "../../../../src/calendar/repository";

const seenNotifications = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const expectedToken = process.env.GOOGLE_WEBHOOK_SECRET;
  if (!expectedToken) {
    return Response.json({ error: "webhook_not_configured" }, { status: 500 });
  }

  return handleCalendarWebhook(request, {
    provider: "google",
    expectedToken,
    listConnections: listConnectedCalendarConnectionsByProvider,
    enqueueJob: enqueueCalendarConnectionSyncJob,
    seenNotifications,
  });
}
