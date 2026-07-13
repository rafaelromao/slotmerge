import { createHmac } from "node:crypto";

import {
  enqueueSyncCalendarConnectionJob,
  type SyncCalendarConnectionPayload,
} from "../../../../src/calendar/sync-jobs";

function verifyMicrosoftWebhookSignature({
  validationToken,
  signature,
  secret,
}: {
  validationToken?: string;
  signature?: string;
  secret: string;
}): boolean {
  if (!validationToken) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(validationToken)
    .digest("base64");

  return signature === expectedSignature;
}

function buildMicrosoftWebhookSignature({
  validationToken,
  secret,
}: {
  validationToken: string;
  secret: string;
}): string {
  return createHmac("sha256", secret).update(validationToken).digest("base64");
}

export async function POST(request: Request): Promise<Response> {
  const webhookSecret = process.env.MICROSOFT_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("MICROSOFT_WEBHOOK_SECRET is not configured");
    return new Response("Internal server error", { status: 500 });
  }

  const validationToken = request.headers.get("X-MS-ValidationToken");
  const subscriptionId = request.headers.get("X-MS-SubscriptionId");
  const subscriptionExpirationTime = request.headers.get(
    "X-MS-Subscription-Expiration-Time",
  );
  const clientState = request.headers.get("X-MS-Client-Request-Id");
  const resourceId = request.headers.get("X-MS-Resource-Id");

  if (validationToken) {
    const signature = request.headers.get("Signature");
    const isValid = verifyMicrosoftWebhookSignature({
      validationToken,
      signature,
      secret: webhookSecret,
    });

    if (!isValid) {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response(validationToken, { status: 200 });
  }

  if (!subscriptionId || !clientState || !resourceId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (subscriptionExpirationTime) {
    const connectionId = extractConnectionIdFromClientState(clientState);
    if (connectionId) {
      await enqueueSyncCalendarConnectionJob(connectionId);
    }
  }

  return new Response("OK", { status: 200 });
}

function extractConnectionIdFromClientState(
  clientState: string,
): string | null {
  try {
    const decoded = Buffer.from(clientState, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as { connectionId?: unknown };
    if (parsed && typeof parsed.connectionId === "string") {
      return parsed.connectionId;
    }
    return null;
  } catch {
    return null;
  }
}

export { buildMicrosoftWebhookSignature };

export type { SyncCalendarConnectionPayload };
