import { createHmac } from "node:crypto";

import {
  enqueueSyncCalendarConnectionJob,
  type SyncCalendarConnectionPayload,
} from "../../../../src/calendar/sync-jobs";

function verifyGoogleWebhookSignature({
  channelId,
  channelToken,
  messageNumber,
  resourceId,
  signature,
  secret,
}: {
  channelId: string;
  channelToken: string;
  messageNumber: string;
  resourceId: string;
  signature: string;
  secret: string;
}): boolean {
  const payload = `${channelId}:${channelToken}:${messageNumber}:${resourceId}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return signature === expectedSignature;
}

function buildGoogleWebhookSignature({
  channelId,
  channelToken,
  messageNumber,
  resourceId,
  secret,
}: {
  channelId: string;
  channelToken: string;
  messageNumber: string;
  resourceId: string;
  secret: string;
}): string {
  const payload = `${channelId}:${channelToken}:${messageNumber}:${resourceId}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.GOOGLE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("GOOGLE_WEBHOOK_SECRET is not configured");
    return new Response("Internal server error", { status: 500 });
  }

  const channelId = request.headers.get("X-Goog-Channel-ID");
  const channelToken = request.headers.get("X-Goog-Channel-Token");
  const messageNumber = request.headers.get("X-Goog-Message-Number");
  const resourceId = request.headers.get("X-Goog-Resource-ID");
  const resourceState = request.headers.get("X-Goog-Resource-State");
  const resourceUri = request.headers.get("X-Goog-Resource-URI");

  if (!channelId || !channelToken || !messageNumber || !resourceId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const signature = request.headers.get("X-Goog-Channel-Expiration") ?? "";

  const isValidSignature = verifyGoogleWebhookSignature({
    channelId,
    channelToken,
    messageNumber,
    resourceId,
    signature,
    secret: webhookSecret,
  });

  if (!isValidSignature) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (resourceState === "sync") {
    return new Response("OK", { status: 200 });
  }

  if (resourceState === "exists" && resourceUri) {
    const connectionId = extractConnectionIdFromChannelToken(channelToken);
    if (connectionId) {
      await enqueueSyncCalendarConnectionJob(connectionId);
    }
  }

  return new Response("OK", { status: 200 });
}

function extractConnectionIdFromChannelToken(channelToken: string): string | null {
  try {
    const decoded = Buffer.from(channelToken, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    return parsed.connectionId ?? null;
  } catch {
    return null;
  }
}

export { buildGoogleWebhookSignature };

export type { SyncCalendarConnectionPayload };
