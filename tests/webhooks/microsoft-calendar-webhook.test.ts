import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  POST,
  buildMicrosoftWebhookSignature,
} from "../../app/webhooks/microsoft/calendar/route";
import { setEnqueueSyncJobForTests } from "../../src/calendar/sync-jobs";

describe("POST /webhooks/microsoft/calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    process.env.MICROSOFT_WEBHOOK_SECRET =
      "webhook-secret-32-characters-!!!!";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setEnqueueSyncJobForTests(null);
    delete process.env.MICROSOFT_WEBHOOK_SECRET;
  });

  it("returns 401 when required notification headers are missing", async () => {
    const response = await POST(
      new Request("http://localhost/webhooks/microsoft/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("handles validation request with valid token", async () => {
    const enqueueSpy = vi.fn().mockResolvedValue(undefined);
    setEnqueueSyncJobForTests(enqueueSpy);

    const validationToken = "validation-token-123";
    const signature = buildMicrosoftWebhookSignature({
      validationToken,
      secret: "webhook-secret-32-characters-!!!!",
    });

    const response = await POST(
      new Request("http://localhost/webhooks/microsoft/calendar", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "X-MS-ValidationToken": validationToken,
          Signature: signature,
        },
        body: validationToken,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe(validationToken);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid notification and enqueues a sync job", async () => {
    const enqueueSpy = vi.fn().mockResolvedValue(undefined);
    setEnqueueSyncJobForTests(enqueueSpy);

    const clientState = Buffer.from(
      JSON.stringify({ connectionId: "connection-456" }),
    ).toString("base64");

    const response = await POST(
      new Request("http://localhost/webhooks/microsoft/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-MS-SubscriptionId": "subscription-123",
          "X-MS-Subscription-Expiration-Time":
            "2026-07-13T13:00:00.000Z",
          "X-MS-Client-Request-Id": clientState,
          "X-MS-Resource-Id": "resource-123",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).toHaveBeenCalledWith("connection-456", undefined);
  });

  it("returns 500 when MICROSOFT_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.MICROSOFT_WEBHOOK_SECRET;

    const response = await POST(
      new Request("http://localhost/webhooks/microsoft/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(500);
  });
});