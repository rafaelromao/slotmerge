import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  CALENDAR_PROVIDER_MODE: z.enum(["mock", "oauth"]).optional(),
  CALENDAR_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  EMAIL_ADAPTER: z.enum(["mock", "postmark"]).optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
  NODE_ENV: z.string().optional(),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
});

export type RuntimeConfig = {
  appEnv: "local" | "test" | "staging" | "production";
  calendarProviderMode: "mock" | "oauth";
  calendarTokenEncryptionKey: string;
  databaseUrl: string;
  emailAdapter: "mock" | "postmark";
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
    appEnv: parsed.APP_ENV,
    calendarProviderMode:
      parsed.CALENDAR_PROVIDER_MODE ?? (isLocal ? "mock" : "oauth"),
    calendarTokenEncryptionKey:
      parsed.CALENDAR_TOKEN_ENCRYPTION_KEY ??
      "local-calendar-token-encryption-key-do-not-use-in-production",
    databaseUrl: parsed.DATABASE_URL,
    emailAdapter: parsed.EMAIL_ADAPTER ?? (isLocal ? "mock" : "postmark"),
    requirePublicWebhookHttps: !isLocal,
    sessionSecret:
      parsed.SESSION_SECRET ?? "local-session-secret-do-not-use-in-production",
    usesGcpSecretManager: false,
  };

  if (!isLocal) {
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
