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
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";
import {
  buildMockMicrosoftGraphAdapter,
  type MockMicrosoftGraphAdapter,
} from "../mock-microsoft-graph-adapter";
import { handleSyncCalendarConnectionJob, setClockForTests } from "../../src/worker/sync";
import { syncCalendarConnection } from "../../src/calendar/sync";
import { createPostgresImportedBusyIntervalRepository } from "../../src/calendar/imported-busy-intervals.repository";
import {
  CALENDAR_CONNECTION_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestClock, getTestDb } from "../helpers/setup";
import { encryptCalendarToken } from "../../src/calendar/token-encryption";
import { calendarConnections } from "../../src/db/schema";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const GOOGLE_CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[0].id;
const MICROSOFT_CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[1].id;
const ALICE_ID = USER_FIXTURES[0].id;

const BUSY_START_1 = new Date("2026-07-13T10:00:00.000Z");
const BUSY_END_1 = new Date("2026-07-13T11:00:00.000Z");
const BUSY_START_2 = new Date("2026-07-14T14:00:00.000Z");
const BUSY_END_2 = new Date("2026-07-14T15:00:00.000Z");

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

describe("E2E: provider webhook updates busy intervals promptly", () => {
  let googleAdapter: MockGoogleCalendarAdapter;
  let microsoftAdapter: MockMicrosoftGraphAdapter;

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

  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    setClockForTests(getTestClock());

    googleAdapter = buildMockGoogleCalendarAdapter();
    microsoftAdapter = buildMockMicrosoftGraphAdapter({
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      primaryCalendarId: "primary",
    });
  });

  afterEach(() => {
    setClockForTests(null);
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

        const googleFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          if (url === "https://calendar.googleapis.com/calendar/v3/freeBusy") {
            return googleAdapter.getFetchImpl()(
              "https://www.googleapis.com/calendar/v3/freeBusy",
              init,
            );
          }

          return googleAdapter.getFetchImpl()(input, init);
        };

        vi.stubGlobal("fetch", googleFetch);

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

        googleAdapter.setFreeBusyResponse("primary", [
          { start: BUSY_START_1, end: BUSY_END_1, status: "busy" },
          { start: BUSY_START_2, end: BUSY_END_2, status: "out-of-office" },
        ]);

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

        await syncCalendarConnection({
          connectionId: GOOGLE_CONNECTION_ID,
          provider: "google",
          accessToken: "google-access-token",
          contributingCalendarIds: ["primary"],
          userId: ALICE_ID,
          timeMin: new Date(
            getTestClock()().getTime() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          timeMax: getTestClock()().toISOString(),
          fetchImpl: googleFetch,
          busyIntervalRepository: createPostgresImportedBusyIntervalRepository(),
          recordFailure: async () => {},
          clock: getTestClock(),
        });

        expect(googleAdapter.freeBusyQueries).toHaveLength(1);
        expect(googleAdapter.freeBusyQueries[0].calendarIds).toEqual(["primary"]);

        await handleSyncCalendarConnectionJob({ connectionId: GOOGLE_CONNECTION_ID });

        const connection = await readConnectionRow(GOOGLE_CONNECTION_ID);
        expect(connection.lastSyncAt).not.toBeNull();
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

        vi.stubGlobal("fetch", microsoftAdapter.getFetchImpl());

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

        microsoftAdapter.setScheduleResponse("primary", {
          availabilityView: "2",
          scheduleItems: [
            {
              isBusy: true,
              start: { dateTime: BUSY_START_1.toISOString(), timeZone: "UTC" },
              end: { dateTime: BUSY_END_1.toISOString(), timeZone: "UTC" },
            },
          ],
        });

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

        await handleSyncCalendarConnectionJob({
          connectionId: MICROSOFT_CONNECTION_ID,
        });

        expect(microsoftAdapter.getScheduleCalls).toHaveLength(1);
        expect(microsoftAdapter.getScheduleCalls[0].schedules).toEqual([
          "primary",
        ]);

        const connection = await readConnectionRow(MICROSOFT_CONNECTION_ID);
        expect(connection.lastSyncAt).not.toBeNull();
      },
    );
  });
});
