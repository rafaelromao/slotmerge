import { describe, expect, it, vi } from "vitest";

import { createHealthResponse } from "./smoke";

describe("local smoke web endpoints", () => {
  it("reports web boot and database connectivity in local mode", async () => {
    const response = await createHealthResponse({
      env: {
        APP_ENV: "local",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
      },
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      database: "ok",
    });
  });

  it("is unavailable outside local or test mode", async () => {
    const response = await createHealthResponse({
      env: {
        APP_ENV: "production",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
        APP_BASE_URL: "https://slotmerge.example.com",
        MAGIC_LINK_SECRET: "production-magic-link-secret",
        SESSION_SECRET: "production-session-secret",
        CALENDAR_TOKEN_ENCRYPTION_KEY: "production-calendar-token-key",
        POSTMARK_SERVER_TOKEN: "postmark-token",
        GOOGLE_OAUTH_CLIENT_ID: "google-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
        MICROSOFT_OAUTH_CLIENT_ID: "microsoft-id",
        MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-secret",
        GOOGLE_WEBHOOK_SECRET: "google-webhook-secret",
        MICROSOFT_WEBHOOK_SECRET: "microsoft-webhook-secret",
      },
      checkDatabase: vi.fn().mockResolvedValue(undefined),
    });

    expect(response.status).toBe(404);
  });
});
