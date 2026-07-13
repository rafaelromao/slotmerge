import { handleCalendarWebhook } from "../../../../src/calendar/webhook-handler";
import { enqueueCalendarConnectionSyncJob } from "../../../../src/calendar/sync-jobs";
import { listConnectedCalendarConnectionsByProvider } from "../../../../src/calendar/repository";
import { loadRuntimeConfig } from "../../../../src/config/runtime";

const seenNotifications = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const config = loadRuntimeConfig();
  const expectedToken = config.googleWebhookSecret;

  return handleCalendarWebhook(request, {
    provider: "google",
    expectedToken,
    listConnections: listConnectedCalendarConnectionsByProvider,
    enqueueJob: enqueueCalendarConnectionSyncJob,
    seenNotifications,
  });
}
