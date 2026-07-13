import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { enqueueSyncCalendarConnectionJob } from "../../../../src/worker/sync";

export async function POST(request: Request): Promise<Response> {
  const config = loadRuntimeConfig();

  if (!config.requirePublicWebhookHttps) {
    return new Response(null, { status: 200 });
  }

  const channelId = request.headers.get("X-Goog-Channel-Id");
  const resourceState = request.headers.get("X-Goog-Resource-State");

  if (!channelId) {
    return new Response(null, { status: 404 });
  }

  if (resourceState === "sync") {
    return new Response(null, { status: 200 });
  }

  const body = (await request.json().catch(() => null)) as {
    calendar_id?: string;
    subscription_id?: string;
  } | null;

  const connectionId = body?.calendar_id ?? body?.subscription_id ?? null;

  if (typeof connectionId === "string") {
    enqueueSyncCalendarConnectionJob(connectionId, config.databaseUrl).catch(
      () => {},
    );
  }

  return new Response(null, { status: 200 });
}
