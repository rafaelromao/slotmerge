import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { POST, buildGoogleWebhookSignature } from "../../app/webhooks/google/calendar/route";
import { setEnqueueSyncJobForTests } from "../../src/calendar/sync-jobs";

describe("POST /webhooks/google/calendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    process.env.GOOGLE_WEBHOOK_SECRET = "webhook-secret-32-characters-!!!!";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setEnqueueSyncJobForTests(null);
    delete process.env.GOOGLE_WEBHOOK_SECRET;
  });

  it("returns 401 when X-Goog-Channel-ID header is missing", async () => {
    const response = await POST(
      new Request("http://localhost/webhooks/google/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 401 when signature verification fails", async () => {
    const enqueueSpy = vi.fn().mockResolvedValue(undefined);
    setEnqueueSyncJobForTests(enqueueSpy);

    const channelId = "test-channel-id";
    const channelToken = "invalid-token";
    const messageNumber = "1";
    const resourceId = "test-resource-id";

    const response = await POST(
      new Request("http://localhost/webhooks/google/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Channel-ID": channelId,
          "X-Goog-Channel-Token": channelToken,
          "X-Goog-Message-Number": messageNumber,
          "X-Goog-Resource-ID": resourceId,
          "X-Goog-Resource-State": "exists",
          "X-Goog-Resource-URI":
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(401);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid sync notification without enqueuing", async () => {
    const enqueueSpy = vi.fn().mockResolvedValue(undefined);
    setEnqueueSyncJobForTests(enqueueSpy);

    const channelId = "test-channel-id";
    const channelToken = Buffer.from(
      JSON.stringify({ connectionId: "connection-123" }),
    ).toString("base64");
    const messageNumber = "1";
    const resourceId = "test-resource-id";

    const signature = buildGoogleWebhookSignature({
      channelId,
      channelToken,
      messageNumber,
      resourceId,
      secret: "webhook-secret-32-characters-!!!!",
    });

    const response = await POST(
      new Request("http://localhost/webhooks/google/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Channel-ID": channelId,
          "X-Goog-Channel-Token": channelToken,
          "X-Goog-Message-Number": messageNumber,
          "X-Goog-Resource-ID": resourceId,
          "X-Goog-Resource-State": "sync",
          "X-Goog-Resource-URI":
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          "X-Goog-Channel-Expiration": signature,
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid exists notification and enqueues a sync job", async () => {
    const enqueueSpy = vi.fn().mockResolvedValue(undefined);
    setEnqueueSyncJobForTests(enqueueSpy);

    const channelId = "test-channel-id";
    const channelToken = Buffer.from(
      JSON.stringify({ connectionId: "connection-123" }),
    ).toString("base64");
    const messageNumber = "2";
    const resourceId = "test-resource-id";

    const signature = buildGoogleWebhookSignature({
      channelId,
      channelToken,
      messageNumber,
      resourceId,
      secret: "webhook-secret-32-characters-!!!!",
    });

    const response = await POST(
      new Request("http://localhost/webhooks/google/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Channel-ID": channelId,
          "X-Goog-Channel-Token": channelToken,
          "X-Goog-Message-Number": messageNumber,
          "X-Goog-Resource-ID": resourceId,
          "X-Goog-Resource-State": "exists",
          "X-Goog-Resource-URI":
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
          "X-Goog-Channel-Expiration": signature,
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(200);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(enqueueSpy).toHaveBeenCalledWith("connection-123", undefined);
  });

  it("returns 500 when GOOGLE_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.GOOGLE_WEBHOOK_SECRET;

    const response = await POST(
      new Request("http://localhost/webhooks/google/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Channel-ID": "test-channel-id",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(500);
  });
});