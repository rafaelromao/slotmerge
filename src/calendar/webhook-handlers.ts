import { createHmac } from "node:crypto";

export type GoogleWebhookDeps = {
  enqueueSync(connectionId: string, runAt: Date): Promise<void>;
};

export type MicrosoftWebhookDeps = {
  enqueueSync(connectionId: string, runAt: Date): Promise<void>;
};

let googleDepsOverride: GoogleWebhookDeps | null = null;
let microsoftDepsOverride: MicrosoftWebhookDeps | null = null;

export function setGoogleWebhookHandlerForTests(deps: GoogleWebhookDeps | null) {
  googleDepsOverride = deps;
}

export function setMicrosoftWebhookHandlerForTests(
  deps: MicrosoftWebhookDeps | null,
) {
  microsoftDepsOverride = deps;
}

function getGoogleDeps(): GoogleWebhookDeps {
  if (!googleDepsOverride) {
    throw new Error("Google webhook handler not configured for tests");
  }
  return googleDepsOverride;
}

function getMicrosoftDeps(): MicrosoftWebhookDeps {
  if (!microsoftDepsOverride) {
    throw new Error("Microsoft webhook handler not configured for tests");
  }
  return microsoftDepsOverride;
}

export async function handleGoogleCalendarWebhook({
  payload,
  signature,
  channelId,
  messageNumber,
  timestamp,
  resourceId,
  secret,
}: {
  payload: string;
  signature: string;
  channelId: string;
  messageNumber: string;
  timestamp: string;
  resourceId: string;
  secret: string;
}): Promise<void> {
  const parsed = JSON.parse(payload) as { resourceState?: string };

  if (parsed.resourceState === "revoked") {
    throw new Error("Channel revoked");
  }

  const signatureInput = `${channelId}${messageNumber}${timestamp}${payload}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signatureInput)
    .digest("base64url");

  if (signature !== expectedSignature) {
    throw new Error("Invalid Google webhook signature");
  }

  const deps = getGoogleDeps();
  await deps.enqueueSync(resourceId, new Date());
}

export function handleMicrosoftCalendarValidationWebhook(
  validationToken: string,
): { status: number; headers: Record<string, string>; body: string } {
  return {
    status: 200,
    headers: { "content-type": "text/plain" },
    body: validationToken,
  };
}

export async function handleMicrosoftCalendarWebhook({
  payload,
  webhookType,
}: {
  payload: string;
  webhookType: string;
  signature?: string;
  subscriptionExpirationDateTime?: string;
}): Promise<{ status: number }> {
  if (webhookType === "validation") {
    return { status: 200 };
  }

  const parsed = JSON.parse(payload) as { clientState?: string };
  const clientState = parsed.clientState;

  if (!clientState) {
    throw new Error("Microsoft webhook missing clientState");
  }

  const deps = getMicrosoftDeps();
  await deps.enqueueSync(clientState, new Date());

  return { status: 200 };
}