import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { enqueueSyncCalendarConnectionJob } from "../../../../src/worker/sync";

export function GET(request: Request): Response {
  const config = loadRuntimeConfig();

  if (!config.requirePublicWebhookHttps) {
    return new Response(null, { status: 200 });
  }

  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");

  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response(null, { status: 404 });
}

export async function POST(request: Request): Promise<Response> {
  const config = loadRuntimeConfig();

  if (!config.requirePublicWebhookHttps) {
    return new Response(null, { status: 200 });
  }

  const subscriptionId = request.headers.get("X-MS-SubscriptionId");
  const channelId = request.headers.get("X-MS-ChannelId");

  if (!subscriptionId && !channelId) {
    return new Response(null, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    subscriptionId?: string;
    clientState?: string;
  } | null;

  const connectionId =
    body?.subscriptionId ??
    (typeof body?.clientState === "string" ? body.clientState : null);

  if (typeof connectionId === "string") {
    enqueueSyncCalendarConnectionJob(connectionId, config.databaseUrl).catch(
      () => {},
    );
  }

  return new Response(null, { status: 200 });
}
