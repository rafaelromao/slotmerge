import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import {
  handleGoogleCalendarWebhook,
  handleMicrosoftCalendarValidationWebhook,
  handleMicrosoftCalendarWebhook,
  setGoogleWebhookHandlerForTests,
  setMicrosoftWebhookHandlerForTests,
} from "./webhook-handlers";

const TEST_SECRET = "test-webhook-secret";
const FIXED_NOW = new Date("2026-07-12T12:00:00.000Z");

describe("handleGoogleCalendarWebhook", () => {
  afterEach(() => {
    setGoogleWebhookHandlerForTests(null);
  });

  it("enqueues a sync job for the connection identified by resourceId when signature is valid", async () => {
    const enqueuedJobs: { connectionId: string; runAt: Date }[] = [];
    setGoogleWebhookHandlerForTests({
      enqueueSync: (connectionId: string, runAt: Date) => {
        enqueuedJobs.push({ connectionId, runAt });
        return Promise.resolve();
      },
    });

    const resourceId = "connection-resource-id-123";
    const messageNumber = "1";
    const channelId = "channel-abc";
    const timestamp = FIXED_NOW.toISOString();

    const payload = JSON.stringify({
      summary: "Calendar event changed",
    });

    const signatureInput = `${channelId}${messageNumber}${timestamp}${payload}`;
    const signature = createHmac("sha256", TEST_SECRET)
      .update(signatureInput)
      .digest("base64url");

    await handleGoogleCalendarWebhook({
      payload,
      signature,
      channelId,
      messageNumber,
      timestamp,
      resourceId,
      secret: TEST_SECRET,
    });

    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]?.connectionId).toBe(resourceId);
  });

  it("throws when signature is invalid", async () => {
    setGoogleWebhookHandlerForTests({
      enqueueSync: () => Promise.resolve(),
    });

    const payload = JSON.stringify({ summary: "Calendar event changed" });

    await expect(
      handleGoogleCalendarWebhook({
        payload,
        signature: "invalid-signature",
        channelId: "channel-abc",
        messageNumber: "1",
        timestamp: FIXED_NOW.toISOString(),
        resourceId: "resource-id",
        secret: TEST_SECRET,
      }),
    ).rejects.toThrow("Invalid Google webhook signature");
  });

  it("throws when channel has been invalidated (resourceState = revoked)", async () => {
    setGoogleWebhookHandlerForTests({
      enqueueSync: () => Promise.resolve(),
    });

    const payload = JSON.stringify({
      summary: "Calendar event changed",
      resourceState: "revoked",
    });

    const timestamp = FIXED_NOW.toISOString();
    const signatureInput = `channel-abc${"1"}${timestamp}${payload}`;
    const signature = createHmac("sha256", TEST_SECRET)
      .update(signatureInput)
      .digest("base64url");

    await expect(
      handleGoogleCalendarWebhook({
        payload,
        signature,
        channelId: "channel-abc",
        messageNumber: "1",
        timestamp,
        resourceId: "resource-id",
        secret: TEST_SECRET,
      }),
    ).rejects.toThrow("Channel revoked");
  });
});

describe("handleMicrosoftCalendarValidationWebhook", () => {
  it("returns 200 OK with the raw validation token as text/plain", () => {
    const validationToken = "abc123-validation-token";

    const response = handleMicrosoftCalendarValidationWebhook(validationToken);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain");
    expect(response.body).toBe(validationToken);
  });
});

describe("handleMicrosoftCalendarWebhook", () => {
  afterEach(() => {
    setMicrosoftWebhookHandlerForTests(null);
  });

  it("enqueues a sync job for the subscription client state when notification is valid", async () => {
    const enqueuedJobs: { connectionId: string; runAt: Date }[] = [];
    setMicrosoftWebhookHandlerForTests({
      enqueueSync: (connectionId: string, runAt: Date) => {
        enqueuedJobs.push({ connectionId, runAt });
        return Promise.resolve();
      },
    });

    const subscriptionId = "microsoft-subscription-123";
    const clientState = "connection-abc";

    const payload = JSON.stringify({
      subscriptionId,
      clientState,
      changeType: "updated",
    });

    const response = await handleMicrosoftCalendarWebhook({
      payload,
      webhookType: "notification",
      signature: "valid-signature",
      subscriptionExpirationDateTime: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

    expect(response.status).toBe(200);
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]?.connectionId).toBe(clientState);
  });

  it("returns 200 OK without enqueuing when webhook type is validation", async () => {
    const enqueuedJobs: { connectionId: string; runAt: Date }[] = [];
    setMicrosoftWebhookHandlerForTests({
      enqueueSync: (connectionId: string, runAt: Date) => {
        enqueuedJobs.push({ connectionId, runAt });
        return Promise.resolve();
      },
    });

    const response = await handleMicrosoftCalendarWebhook({
      payload: "{}",
      webhookType: "validation",
      signature: "",
      subscriptionExpirationDateTime: "",
    });

    expect(response.status).toBe(200);
    expect(enqueuedJobs).toHaveLength(0);
  });
});
