import { z } from "zod";

const envSchema = z.object({
  APP_BASE_URL: z.string().optional(),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  APP_PUBLIC_URL: z.string().url().optional(),
  CALENDAR_PROVIDER_MODE: z.enum(["mock", "oauth"]).optional(),
  CALENDAR_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  EMAIL_ADAPTER: z.enum(["mock", "postmark"]).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  LOCAL_PROVIDER_OVERRIDE_URL: z.string().optional(),
  MAGIC_LINK_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
});

export type RuntimeConfig = {
  appBaseUrl: string;
  appEnv: "local" | "test" | "staging" | "production";
  appPublicUrl: string;
  calendarProviderMode: "mock" | "oauth";
  calendarTokenEncryptionKey: string;
  databaseUrl: string;
  emailAdapter: "mock" | "postmark";
  localProviderOverrideUrl: string | undefined;
  magicLinkSecret: string;
  requirePublicWebhookHttps: boolean;
  sessionSecret: string;
  usesGcpSecretManager: false;
};

export type RuntimeEnv = Record<string, string | undefined>;

export function loadRuntimeConfig(
  env: RuntimeEnv = process.env,
): RuntimeConfig {
  const parsed = envSchema.parse(env);
  const isLocal = parsed.APP_ENV === "local" || parsed.APP_ENV === "test";

  const config: RuntimeConfig = {
    appBaseUrl: parsed.APP_BASE_URL ?? "http://localhost:3000",
    appEnv: parsed.APP_ENV,
    appPublicUrl: parsed.APP_PUBLIC_URL ?? "http://localhost",
    calendarProviderMode:
      parsed.CALENDAR_PROVIDER_MODE ?? (isLocal ? "mock" : "oauth"),
    calendarTokenEncryptionKey:
      parsed.CALENDAR_TOKEN_ENCRYPTION_KEY ??
      "local-calendar-token-encryption-key-do-not-use-in-production",
    databaseUrl: parsed.DATABASE_URL,
    emailAdapter: parsed.EMAIL_ADAPTER ?? (isLocal ? "mock" : "postmark"),
    localProviderOverrideUrl: parsed.LOCAL_PROVIDER_OVERRIDE_URL,
    magicLinkSecret:
      parsed.MAGIC_LINK_SECRET ??
      "local-magic-link-secret-do-not-use-in-production",
    requirePublicWebhookHttps: !isLocal,
    sessionSecret:
      parsed.SESSION_SECRET ?? "local-session-secret-do-not-use-in-production",
    usesGcpSecretManager: false,
  };

  if (!isLocal) {
    requireEnv(parsed.APP_BASE_URL, "APP_BASE_URL");
    requireEnv(parsed.MAGIC_LINK_SECRET, "MAGIC_LINK_SECRET");
    requireEnv(parsed.SESSION_SECRET, "SESSION_SECRET");
    requireEnv(
      parsed.CALENDAR_TOKEN_ENCRYPTION_KEY,
      "CALENDAR_TOKEN_ENCRYPTION_KEY",
    );
    if (config.emailAdapter === "postmark") {
      requireEnv(parsed.POSTMARK_SERVER_TOKEN, "POSTMARK_SERVER_TOKEN");
    }
    if (config.calendarProviderMode === "oauth") {
      requireEnv(parsed.GOOGLE_OAUTH_CLIENT_ID, "GOOGLE_OAUTH_CLIENT_ID");
      requireEnv(
        parsed.GOOGLE_OAUTH_CLIENT_SECRET,
        "GOOGLE_OAUTH_CLIENT_SECRET",
      );
      requireEnv(parsed.MICROSOFT_OAUTH_CLIENT_ID, "MICROSOFT_OAUTH_CLIENT_ID");
      requireEnv(
        parsed.MICROSOFT_OAUTH_CLIENT_SECRET,
        "MICROSOFT_OAUTH_CLIENT_SECRET",
      );
    }
  }

  return config;
}

function requireEnv(
  value: string | undefined,
  name: string,
): asserts value is string {
  if (!value) {
    throw new Error(`${name} is required outside local/test runtime mode`);
  }
}
