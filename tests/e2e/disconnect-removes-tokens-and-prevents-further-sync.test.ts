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

import { PATCH } from "../../app/me/calendar-connections/[id]/route";
import { GET as LIST_CONNECTIONS } from "../../app/me/calendar-connections/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { encryptCalendarToken } from "../../src/calendar/token-encryption";
import { getProfileByUserId } from "../../src/profile/repository";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import {
  createDefaultSearchSnapshotAssemblerDeps,
  SearchSnapshotAssembler,
} from "../../src/search/search-snapshot-assembler";
import {
  buildMockGoogleCalendarAdapter,
  type MockGoogleCalendarAdapter,
} from "../google-calendar-adapter";
import {
  discoverabilityConsents,
  calendarConnections,
} from "../../src/db/schema";
import { handleSyncCalendarConnectionJob, setClockForTests } from "../../src/worker/sync";
import {
  CALENDAR_CONNECTION_FIXTURES,
  SESSION_FIXTURES,
  TOPIC_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestClock, getTestDb } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const ALICE_ID = USER_FIXTURES[0].id;
const ORGANIZER_ID = USER_FIXTURES[1].id;
const SELECTED_TOPIC_ID = TOPIC_FIXTURES[0].id;
const CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[0].id;
const SESSION_ID = SESSION_FIXTURES[0].id;
const CSRF_TOKEN = SESSION_FIXTURES[0].csrfToken;
const SLOT_START = new Date("2026-07-13T15:00:00.000Z");
const RANGE_START = new Date("2026-07-13T00:00:00.000Z");
const RANGE_END = new Date("2026-07-14T00:00:00.000Z");
const DURATION_MINUTES = 60;

function aliceSession() {
  return {
    user: {
      id: ALICE_ID,
      email: USER_FIXTURES[0].email,
      displayName: USER_FIXTURES[0].displayName,
      avatarUrl: null,
      shortBio: null,
      role: USER_FIXTURES[0].role,
      status: USER_FIXTURES[0].status,
      profileTimezone: USER_FIXTURES[0].profileTimezone,
      bufferMinutes: USER_FIXTURES[0].bufferMinutes,
    },
    csrfToken: CSRF_TOKEN,
  };
}

function buildDisconnectFetch(adapter: MockGoogleCalendarAdapter): typeof fetch {
  return (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url === "https://oauth2.googleapis.com/revoke") {
      return Promise.resolve(new Response(null, { status: 200 }));
    }

    if (url === "https://calendar.googleapis.com/calendar/v3/freeBusy") {
      return adapter.getFetchImpl()(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        init,
      );
    }

    return adapter.getFetchImpl()(input, init);
  };
}

async function patchDisconnect(): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
  return PATCH(
    new Request(`http://localhost/me/calendar-connections/${CONNECTION_ID}`, {
      method: "PATCH",
      headers: {
        cookie,
        "x-csrf-token": CSRF_TOKEN,
      },
    }),
    { params: Promise.resolve({ id: CONNECTION_ID }) },
  );
}

async function getConnectionView(): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
  return LIST_CONNECTIONS(
    new Request("http://localhost/me/calendar-connections", {
      headers: { cookie },
    }),
  );
}

async function readConnectionRow(): Promise<{
  refreshTokenEncrypted: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: string | null;
  status: string;
}> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{
    refresh_token_encrypted: string | null;
    access_token_encrypted: string | null;
    access_token_expires_at: string | null;
    status: string;
  }>(
    `SELECT refresh_token_encrypted, access_token_encrypted, access_token_expires_at, status
     FROM calendar_connections
     WHERE id = '${CONNECTION_ID}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("calendar connection row not found");
  }
  return {
    refreshTokenEncrypted: row.refresh_token_encrypted,
    accessTokenEncrypted: row.access_token_encrypted,
    accessTokenExpiresAt: row.access_token_expires_at,
    status: row.status,
  };
}

describe("E2E: disconnect removes tokens and prevents further sync", () => {
  let adapter: MockGoogleCalendarAdapter;

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
    adapter = buildMockGoogleCalendarAdapter();
    vi.stubGlobal("fetch", buildDisconnectFetch(adapter));
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    setClockForTests(null);
    vi.unstubAllGlobals();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  });

  it.runIf(HAS_TEST_DB)(
    "removes encrypted tokens, flips status to disconnected, blocks further sync, and keeps the User eligible via manual Availability",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      const now = getTestClock()();

      await db
        .update(calendarConnections)
        .set({
          status: "connected",
          refreshTokenEncrypted: encryptCalendarToken({
            plaintext: "refresh-token-alice",
            key: TOKEN_ENCRYPTION_KEY,
          }),
          accessTokenEncrypted: encryptCalendarToken({
            plaintext: "access-token-alice",
            key: TOKEN_ENCRYPTION_KEY,
          }),
          accessTokenExpiresAt: new Date("2026-07-13T16:00:00.000Z"),
          contributingCalendarIds: ["primary"],
        })
        .where(eq(calendarConnections.id, CONNECTION_ID));

      await db.insert(discoverabilityConsents).values({
        userId: ALICE_ID,
        grantedAt: now,
      });

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
      });

      await handleSyncCalendarConnectionJob({ connectionId: CONNECTION_ID });
      const freeBusyQueriesAfterFirstSync = adapter.freeBusyQueries.length;
      expect(freeBusyQueriesAfterFirstSync).toBe(1);

      const patchResponse = await patchDisconnect();
      expect(patchResponse.status).toBe(200);
      const patchBody = (await patchResponse.json()) as {
        connection: { status: string };
      };
      expect(patchBody.connection.status).toBe("disconnected");

      const row = await readConnectionRow();
      expect(row.refreshTokenEncrypted).toBeNull();
      expect(row.accessTokenEncrypted).toBeNull();
      expect(row.accessTokenExpiresAt).toBeNull();
      expect(row.status).toBe("disconnected");

      await handleSyncCalendarConnectionJob({ connectionId: CONNECTION_ID });
      expect(adapter.freeBusyQueries.length).toBe(
        freeBusyQueriesAfterFirstSync,
      );

      const listResponse = await getConnectionView();
      expect(listResponse.status).toBe(200);
      const listBody = (await listResponse.json()) as {
        connections: Array<{ id: string; status: string; healthStatus: string }>;
      };
      const listed = listBody.connections.find((c) => c.id === CONNECTION_ID);
      expect(listed).toBeDefined();
      expect(listed?.status).toBe("disconnected");
      expect(listed?.healthStatus).toBe("disconnected");

      const matches = await runMatchingViaAssembler();
      expect(matches).toContain(ALICE_ID);
    },
  );
});

async function runMatchingViaAssembler(): Promise<string[]> {
  const assembler = new SearchSnapshotAssembler(
    createDefaultSearchSnapshotAssemblerDeps({
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      topicRepository: {
        listActive() {
          return Promise.resolve(
            TOPIC_FIXTURES.filter((t) => t.status === "active").map((t) => ({
              id: t.id,
              name: t.name,
              status: "active" as const,
            })),
          );
        },
      },
      profileRepository: {
        findByUserId(uid) {
          return getProfileByUserId(uid);
        },
      },
    }),
  );
  const snapshot = await assembler.assemble({
    organizerId: ORGANIZER_ID,
    selectedTopicIds: [SELECTED_TOPIC_ID],
    durationMinutes: DURATION_MINUTES,
    dateRangeStart: RANGE_START,
    dateRangeEnd: RANGE_END,
    organizerTimezone: "UTC",
    minimumMatchingUsers: 1,
    now: getTestClock()(),
  });
  const slotKey = SLOT_START.toISOString();
  const matched = new Set<string>();
  for (const slot of snapshot.slots) {
    if (slot.startUtc !== slotKey) continue;
    for (const match of slot.matches) {
      matched.add(match.userId);
    }
  }
  return Array.from(matched);
}
