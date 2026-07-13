import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./runtime";

describe("loadRuntimeConfig", () => {
  it("uses local-safe adapters and placeholder secrets without GCP Secret Manager in local mode", () => {
    const config = loadRuntimeConfig({
      NODE_ENV: "development",
      APP_ENV: "local",
      DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
    });

    expect(config).toMatchObject({
      appEnv: "local",
      emailAdapter: "mock",
      calendarProviderMode: "mock",
      requirePublicWebhookHttps: false,
      usesGcpSecretManager: false,
    });
    expect(config.sessionSecret).toContain("local");
    expect(config.calendarTokenEncryptionKey).toContain("local");
    expect(config.magicLinkSecret).toContain("local");
    expect(config.appBaseUrl).toBe("http://localhost:3000");
  });

  it("fails fast in production when required non-local secrets are missing", () => {
    expect(() =>
      loadRuntimeConfig({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("fails fast in production when MAGIC_LINK_SECRET is missing", () => {
    expect(() =>
      loadRuntimeConfig({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
        APP_BASE_URL: "https://slotmerge.example.com",
        SESSION_SECRET: "production-session-secret",
        CALENDAR_TOKEN_ENCRYPTION_KEY: "production-calendar-token-key",
        GOOGLE_WEBHOOK_SECRET: "google-webhook-secret",
        MICROSOFT_WEBHOOK_SECRET: "microsoft-webhook-secret",
      }),
    ).toThrow(/MAGIC_LINK_SECRET/);
  });

  it("fails fast in production when APP_BASE_URL is missing", () => {
    expect(() =>
      loadRuntimeConfig({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
        SESSION_SECRET: "production-session-secret",
        CALENDAR_TOKEN_ENCRYPTION_KEY: "production-calendar-token-key",
        MAGIC_LINK_SECRET: "production-magic-link-secret",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("passes production validation with all required secrets and APP_BASE_URL", () => {
    const config = loadRuntimeConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
      SESSION_SECRET: "production-session-secret",
      CALENDAR_TOKEN_ENCRYPTION_KEY: "production-calendar-token-key",
      MAGIC_LINK_SECRET: "production-magic-link-secret",
      APP_BASE_URL: "https://slotmerge.example.com",
      POSTMARK_SERVER_TOKEN: "postmark-token",
      GOOGLE_OAUTH_CLIENT_ID: "google-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
      MICROSOFT_OAUTH_CLIENT_ID: "microsoft-id",
      MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-secret",
      GOOGLE_WEBHOOK_SECRET: "google-webhook-secret",
      MICROSOFT_WEBHOOK_SECRET: "microsoft-webhook-secret",
    });

    expect(config.appBaseUrl).toBe("https://slotmerge.example.com");
    expect(config.magicLinkSecret).toBe("production-magic-link-secret");
    expect(config.sessionSecret).toBe("production-session-secret");
  });
});
