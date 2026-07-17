import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";

vi.mock("../../src/worker/sync", () => ({
  enqueueSyncCalendarConnectionJob: vi.fn().mockResolvedValue(undefined),
}));

import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../../src/calendar/repository";
import {
  type GoogleCalendarConnectionRecord,
  type GoogleCalendarConnectionRepository,
} from "../../src/calendar/google-calendar-connections";
import {
  type MicrosoftCalendarConnectionRecord,
  type MicrosoftCalendarConnectionRepository,
} from "../../src/calendar/microsoft-calendar-connections";
import { USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";
import { enqueueSyncCalendarConnectionJob } from "../../src/worker/sync";
import {
  handlePollCalendarConnectionsJob,
  MAX_JITTER_MS,
} from "../../src/worker/poll";
import { buildTestClock } from "../test-clock";
import { calendarConnections } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE = USER_FIXTURES[0];
const GOOGLE_CONNECTION_ID = "00000000-0000-0000-0000-000000000091";
const MICROSOFT_CONNECTION_ID = "00000000-0000-0000-0000-000000000092";

const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

function wireTestRepositories(): void {
  const db = getRequiredTestDb();

  const googleRepository: GoogleCalendarConnectionRepository = {
    createPending: (record) => Promise.resolve(record),
    listByUserId: async () => {
      const rows = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.provider, "google"));
      return rows as GoogleCalendarConnectionRecord[];
    },
    findById: async (id) => {
      const [row] = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.id, id))
        .limit(1);
      if (!row || row.provider !== "google") return null;
      return row as GoogleCalendarConnectionRecord;
    },
    updateById: async (id, patch) => {
      const sets: ReturnType<typeof sql>[] = [];
      if ("lastSyncAt" in patch)
        sets.push(sql`last_sync_at = ${patch.lastSyncAt}`);
      sets.push(sql`updated_at = NOW()`);

      const setSql = sets.reduce((acc, curr, i) =>
        i === 0 ? curr : sql`${acc}, ${curr}`,
      );

      const result = await db.execute(
        sql`UPDATE calendar_connections SET ${setSql} WHERE id = ${id} AND provider = 'google' RETURNING *`,
      );
      const updated = (result.rows[0] ??
        null) as GoogleCalendarConnectionRecord | null;
      return updated;
    },
  };

  const microsoftRepository: MicrosoftCalendarConnectionRepository = {
    createPending: (record) => Promise.resolve(record),
    listByUserId: async () => {
      const rows = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.provider, "microsoft"));
      return rows as MicrosoftCalendarConnectionRecord[];
    },
    findById: async (id) => {
      const [row] = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.id, id))
        .limit(1);
      if (!row || row.provider !== "microsoft") return null;
      return row as MicrosoftCalendarConnectionRecord;
    },
    updateById: async (id, patch) => {
      const sets: ReturnType<typeof sql>[] = [];
      if ("lastSyncAt" in patch)
        sets.push(sql`last_sync_at = ${patch.lastSyncAt}`);
      sets.push(sql`updated_at = NOW()`);

      const setSql = sets.reduce((acc, curr, i) =>
        i === 0 ? curr : sql`${acc}, ${curr}`,
      );

      const result = await db.execute(
        sql`UPDATE calendar_connections SET ${setSql} WHERE id = ${id} AND provider = 'microsoft' RETURNING *`,
      );
      const updated = (result.rows[0] ??
        null) as MicrosoftCalendarConnectionRecord | null;
      return updated;
    },
  };

  setGoogleCalendarConnectionRepositoryForTests(googleRepository);
  setMicrosoftCalendarConnectionRepositoryForTests(microsoftRepository);
}

async function seedConnectedGoogleConnection(
  connectionId: string,
): Promise<void> {
  await getRequiredTestDb().execute(
    `INSERT INTO calendar_connections
      (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
      VALUES
        ('${connectionId}', '${ALICE.id}', 'google', 'google:${connectionId}', 'google:${connectionId}', 'https://www.googleapis.com/auth/calendar.freebusy', 'connected', '["primary"]'::jsonb, NOW(), NOW())`,
  );
}

async function seedConnectedMicrosoftConnection(
  connectionId: string,
): Promise<void> {
  await getRequiredTestDb().execute(
    `INSERT INTO calendar_connections
      (id, user_id, provider, provider_account_key, account_identifier, scopes, status, contributing_calendar_ids, created_at, updated_at)
      VALUES
        ('${connectionId}', '${ALICE.id}', 'microsoft', 'microsoft:${connectionId}', 'microsoft:${connectionId}', 'offline_access Calendars.ReadBasic', 'connected', '["user@domain.com"]'::jsonb, NOW(), NOW())`,
  );
}

async function clearTestConnection(connectionId: string): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM imported_busy_intervals WHERE connection_id = '${connectionId}'`,
  );
  await getRequiredTestDb().execute(
    `DELETE FROM calendar_connections WHERE id = '${connectionId}'`,
  );
}

describe("E2E: polling fallback enqueues sync jobs", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    vi.mocked(enqueueSyncCalendarConnectionJob).mockClear();
  });

  afterEach(async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    await clearTestConnection(GOOGLE_CONNECTION_ID);
    await clearTestConnection(MICROSOFT_CONNECTION_ID);
  });

  it.runIf(HAS_TEST_DB)(
    "handlePollCalendarConnectionsJob enqueues sync jobs for all active connections with jitter in 0-5 minute range",
    async () => {
      await setupTest();

      await getRequiredTestDb().execute(
        `DELETE FROM calendar_connections WHERE id IN ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000031')`,
      );

      wireTestRepositories();

      await seedConnectedGoogleConnection(GOOGLE_CONNECTION_ID);
      await seedConnectedMicrosoftConnection(MICROSOFT_CONNECTION_ID);

      const clock = buildTestClock(getTestClock()());
      const randomSource = { next: () => 0.5 };

      await handlePollCalendarConnectionsJob(undefined, {
        clock,
        randomSource,
      });

      expect(vi.mocked(enqueueSyncCalendarConnectionJob)).toHaveBeenCalledTimes(
        2,
      );

      const calledConnectionIds = new Set(
        vi
          .mocked(enqueueSyncCalendarConnectionJob)
          .mock.calls.map((call) => (call as [string, string, Date])[0]),
      );
      expect(calledConnectionIds).toContain(GOOGLE_CONNECTION_ID);
      expect(calledConnectionIds).toContain(MICROSOFT_CONNECTION_ID);

      for (const call of vi.mocked(enqueueSyncCalendarConnectionJob).mock
        .calls) {
        const [, , runAt] = call as [string, string, Date];
        const baseTime = clock.now().getTime();
        const jitterMs = runAt.getTime() - baseTime;
        expect(jitterMs).toBeGreaterThanOrEqual(0);
        expect(jitterMs).toBeLessThanOrEqual(MAX_JITTER_MS);
      }
    },
  );
});
