import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";

import { POST as GOOGLE_WEBHOOK } from "../../app/webhooks/google/calendar/route";
import { POST as MICROSOFT_WEBHOOK } from "../../app/webhooks/microsoft/calendar/route";
import {
  enqueueSyncCalendarConnectionJob,
  handleSyncCalendarConnectionJob,
} from "../../src/worker/sync";
import { CALENDAR_CONNECTION_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb } from "../helpers/setup";
import { systemRandomSource } from "../../src/system/random";
import { encryptCalendarToken } from "../../src/calendar/token-encryption";
import { calendarConnections } from "../../src/db/schema";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../../src/calendar/repository";

vi.mock("../../src/config/runtime", () => ({
  loadRuntimeConfig: vi.fn().mockReturnValue({
    appBaseUrl: "http://localhost:3000",
    appEnv: "test" as const,
    appPublicUrl: "http://localhost",
    calendarProviderMode: "mock" as const,
    calendarTokenEncryptionKey: "0123456789abcdef0123456789abcdef",
    databaseUrl:
      process.env.DATABASE_URL ??
      "postgres://slotmerge:slotmerge@localhost:5432/slotmerge",
    emailAdapter: "mock" as const,
    magicLinkSecret: "test-secret",
    requirePublicWebhookHttps: true,
    sessionSecret: "test-session-secret",
    usesGcpSecretManager: false,
  }),
}));

vi.mock("../../src/worker/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/worker/sync")>();
  return {
    ...actual,
    enqueueSyncCalendarConnectionJob: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../src/calendar/token-encryption", () => ({
  decryptCalendarToken: vi.fn().mockReturnValue("decrypted-token"),
  encryptCalendarToken: vi.fn().mockReturnValue("encrypted-token"),
}));

function makeBusyIntervals() {
  const now = new Date();
  const start1 = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const end1 = new Date(start1.getTime() + 60 * 60 * 1000);
  const start2 = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const end2 = new Date(start2.getTime() + 60 * 60 * 1000);
  return {
    googleBusyInterval: {
      providerCalendarId: "primary",
      eventId: null,
      status: "busy" as const,
      startAt: start1,
      endAt: end1,
    },
    googleOooInterval: {
      providerCalendarId: "primary",
      eventId: null,
      status: "out-of-office" as const,
      startAt: start2,
      endAt: end2,
    },
    microsoftBusyInterval: {
      providerCalendarId: "primary",
      eventId: null,
      status: "busy" as const,
      startAt: start1,
      endAt: end1,
    },
  };
}

const busyIntervals = makeBusyIntervals();

vi.mock("../../src/calendar/freebusy/google", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/calendar/freebusy/google")>();
  return {
    ...actual,
    fetchGoogleFreeBusy: vi
      .fn()
      .mockResolvedValue([
        busyIntervals.googleBusyInterval,
        busyIntervals.googleOooInterval,
      ]),
  };
});

vi.mock("../../src/calendar/freebusy/microsoft", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/calendar/freebusy/microsoft")
    >();
  return {
    ...actual,
    fetchMicrosoftFreeBusy: vi
      .fn()
      .mockResolvedValue([busyIntervals.microsoftBusyInterval]),
  };
});

vi.mock("../../src/calendar/sync", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/calendar/sync")>();
  return {
    ...actual,
    syncCalendarConnection: actual.syncCalendarConnection,
  };
});

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const GOOGLE_CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[0].id;
const MICROSOFT_CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[1].id;

async function readConnectionRow(connectionId: string): Promise<{
  lastSyncAt: Date | null;
  status: string;
  contributingCalendarIds: string[];
}> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{
    last_sync_at: Date | null;
    status: string;
    contributing_calendar_ids: string[];
  }>(
    `SELECT last_sync_at, status, contributing_calendar_ids
     FROM calendar_connections WHERE id = '${connectionId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("calendar connection row not found");
  }
  return {
    lastSyncAt: row.last_sync_at,
    status: row.status,
    contributingCalendarIds: row.contributing_calendar_ids,
  };
}

async function readImportedBusyIntervals(connectionId: string): Promise<
  Array<{
    status: string;
    startAt: Date;
    endAt: Date;
  }>
> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{
    status: string;
    start_at: Date;
    end_at: Date;
  }>(
    `SELECT status, start_at, end_at
     FROM imported_busy_intervals
     WHERE connection_id = '${connectionId}'
     ORDER BY start_at`,
  );
  return result.rows.map((row) => ({
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
  }));
}

describe("E2E: provider webhook updates busy intervals promptly", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
  });

  beforeEach(async () => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);

    const db = getTestDb();
    if (db) {
      await db.execute(
        `DELETE FROM imported_busy_intervals WHERE connection_id IN ('${GOOGLE_CONNECTION_ID}', '${MICROSOFT_CONNECTION_ID}')`,
      );
    }
  });

  afterEach(() => {
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  describe("Google Calendar webhook", () => {
    it.runIf(HAS_TEST_DB)(
      "triggers free/busy sync and advances last_sync_at when webhook is delivered",
      async () => {
        const db = getTestDb();
        expect(db).not.toBeNull();
        if (!db) {
          return;
        }

        await db
          .update(calendarConnections)
          .set({
            status: "connected",
            refreshTokenEncrypted: encryptCalendarToken({
              plaintext: "google-refresh-token",
              key: TOKEN_ENCRYPTION_KEY,
            }),
            accessTokenEncrypted: encryptCalendarToken({
              plaintext: "google-access-token",
              key: TOKEN_ENCRYPTION_KEY,
            }),
            accessTokenExpiresAt: new Date("2026-07-13T16:00:00.000Z"),
            contributingCalendarIds: ["primary"],
            lastSyncAt: null,
          })
          .where(eq(calendarConnections.id, GOOGLE_CONNECTION_ID));

        const webhookResponse = await GOOGLE_WEBHOOK(
          new Request("http://localhost/calendar/webhook", {
            method: "POST",
            headers: {
              "x-goog-channel-id": "channel-abc",
              "x-goog-resource-state": "exists",
            },
            body: JSON.stringify({ calendar_id: GOOGLE_CONNECTION_ID }),
          }),
        );
        expect(webhookResponse.status).toBe(200);
        expect(
          vi.mocked(enqueueSyncCalendarConnectionJob),
        ).toHaveBeenCalledOnce();
        expect(
          vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[0][0],
        ).toBe(GOOGLE_CONNECTION_ID);

        await handleSyncCalendarConnectionJob(
          { connectionId: GOOGLE_CONNECTION_ID },
          {
            clock: { now: getTestClock() },
            randomSource: systemRandomSource(),
          },
        );

        const connection = await readConnectionRow(GOOGLE_CONNECTION_ID);
        expect(connection.lastSyncAt).not.toBeNull();

        const importedIntervals =
          await readImportedBusyIntervals(GOOGLE_CONNECTION_ID);
        expect(importedIntervals).toHaveLength(2);
        expect(importedIntervals[0].status).toBe("busy");
        expect(importedIntervals[1].status).toBe("out-of-office");
      },
    );
  });

  describe("Microsoft Calendar webhook", () => {
    it.runIf(HAS_TEST_DB)(
      "triggers schedule sync and advances last_sync_at when webhook is delivered",
      async () => {
        const db = getTestDb();
        expect(db).not.toBeNull();
        if (!db) {
          return;
        }

        await db
          .update(calendarConnections)
          .set({
            status: "connected",
            refreshTokenEncrypted: encryptCalendarToken({
              plaintext: "microsoft-refresh-token",
              key: TOKEN_ENCRYPTION_KEY,
            }),
            accessTokenEncrypted: encryptCalendarToken({
              plaintext: "microsoft-access-token",
              key: TOKEN_ENCRYPTION_KEY,
            }),
            accessTokenExpiresAt: new Date("2026-07-13T16:00:00.000Z"),
            contributingCalendarIds: ["primary"],
            lastSyncAt: null,
          })
          .where(eq(calendarConnections.id, MICROSOFT_CONNECTION_ID));

        const webhookResponse = await MICROSOFT_WEBHOOK(
          new Request("http://localhost/app/webhooks/microsoft/calendar", {
            method: "POST",
            headers: {
              "x-ms-subscription-id": "subscription-xyz",
            },
            body: JSON.stringify({
              subscriptionId: MICROSOFT_CONNECTION_ID,
              clientState: "connection-2",
            }),
          }),
        );
        expect(webhookResponse.status).toBe(200);
        expect(
          vi.mocked(enqueueSyncCalendarConnectionJob),
        ).toHaveBeenCalledOnce();
        expect(
          vi.mocked(enqueueSyncCalendarConnectionJob).mock.calls[0][0],
        ).toBe(MICROSOFT_CONNECTION_ID);

        await handleSyncCalendarConnectionJob(
          { connectionId: MICROSOFT_CONNECTION_ID },
          {
            clock: { now: getTestClock() },
            randomSource: systemRandomSource(),
          },
        );

        const connection = await readConnectionRow(MICROSOFT_CONNECTION_ID);
        expect(connection.lastSyncAt).not.toBeNull();

        const importedIntervals = await readImportedBusyIntervals(
          MICROSOFT_CONNECTION_ID,
        );
        expect(importedIntervals).toHaveLength(1);
        expect(importedIntervals[0].status).toBe("busy");
      },
    );
  });
});
