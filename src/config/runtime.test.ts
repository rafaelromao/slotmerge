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
  });

  it("fails fast in production when required non-local secrets are missing", () => {
    expect(() =>
      loadRuntimeConfig({
        NODE_ENV: "production",
        APP_ENV: "production",
        DATABASE_URL: "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
      }),
    ).toThrow(/SESSION_SECRET/);
  });
});
