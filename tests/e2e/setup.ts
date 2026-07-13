/**
 * Shared setup for E2E tests.
 * Configures environment, global beforeEach/afterEach, and E2E helpers.
 *
 * E2E coverage: all slices — tests 1-62
 */

import { beforeEach, afterEach, beforeAll, afterAll } from "vitest";

import { TestClock } from "./helpers/clock";
import { MockEmailAdapter } from "./helpers/email";
import { MockGoogleCalendar } from "./helpers/google-calendar";
import { MockMicrosoftGraph } from "./helpers/microsoft-graph";
import { resetDatabase } from "./helpers/db";
import { setClockForTests } from "../../src/config/runtime";

const TEST_ENV = {
  APP_ENV: "test",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
  EMAIL_ADAPTER: "mock",
  CALENDAR_PROVIDER_MODE: "mock",
  MAGIC_LINK_SECRET: "e2e-test-magic-link-secret",
  SESSION_SECRET: "e2e-test-session-secret-0123456789abcdef",
  APP_BASE_URL: "http://localhost:3000",
  APP_PUBLIC_URL: "http://localhost:3000",
  GOOGLE_OAUTH_CLIENT_ID: "e2e-google-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "e2e-google-client-secret",
  MICROSOFT_OAUTH_CLIENT_ID: "e2e-microsoft-client-id",
  MICROSOFT_OAUTH_CLIENT_SECRET: "e2e-microsoft-client-secret",
  CALENDAR_TOKEN_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
};

function setEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

beforeAll(() => {
  setEnv(TEST_ENV);
});

beforeEach(async () => {
  await resetDatabase();
  TestClock.reset();
  setClockForTests(() => TestClock.now());
  MockEmailAdapter.reset();
  MockGoogleCalendar.reset();
  MockMicrosoftGraph.reset();
});

afterEach(() => {
  TestClock.reset();
  MockEmailAdapter.reset();
  MockGoogleCalendar.reset();
  MockMicrosoftGraph.reset();
});

afterAll(() => {
  setEnv({});
});
