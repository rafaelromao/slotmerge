import { afterEach, describe, expect, inject, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { setSessionRepositoryForTests } from "../../src/auth/session";
import { calendarConnections } from "../../src/db/schema";
import {
  CALENDAR_CONNECTION_FIXTURES,
  SESSION_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { listConnectionsForTests } from "../helpers/calendar-connection-tests";
import { getTestDb, setupTest } from "../helpers/setup";

vi.mock("../../src/worker/sync", () => ({
  enqueueSyncCalendarConnectionJob: vi.fn().mockResolvedValue(undefined),
}));

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE_ID = USER_FIXTURES[0].id;
const CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[0].id;
const SESSION_ID = SESSION_FIXTURES[0].id;
const CSRF_TOKEN = SESSION_FIXTURES[0].csrfToken;

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

async function getConnectionView(): Promise<{
  connections: Awaited<
    ReturnType<typeof listConnectionsForTests>
  >["connections"];
}> {
  return listConnectionsForTests(ALICE_ID);
}

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

describe.runIf(HAS_TEST_DB)(
  "Calendar Connection Health - AC1: My availability shows status and last_sync",
  () => {
    afterEach(() => {
      vi.resetAllMocks();
    });

    it("GET /me/calendar-connections returns displayStatus, lastSyncAt, and stale fields", async () => {
      await setupTest();
      const db = getRequiredTestDb();

      await db
        .update(calendarConnections)
        .set({
          status: "connected",
          lastSyncAt: new Date("2026-07-12T12:00:00.000Z"),
        })
        .where(eq(calendarConnections.id, CONNECTION_ID));

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
      });

      const { connections } = await getConnectionView();
      const connection = connections.find((c) => c.id === CONNECTION_ID);
      expect(connection).toBeDefined();
      expect(connection?.id).toBe(CONNECTION_ID);
      expect(connection?.displayStatus).toBe("connected");
      expect(connection).toHaveProperty("displayStatus");
      expect(connection).toHaveProperty("lastSyncAt");
      expect(connection).toHaveProperty("stale");
      expect(typeof connection?.displayStatus).toBe("string");
      expect(typeof connection?.stale).toBe("boolean");
    });

    it("connection with null lastSyncAt shows stale true", async () => {
      await setupTest();
      const db = getRequiredTestDb();

      await db
        .update(calendarConnections)
        .set({
          status: "connected",
          lastSyncAt: null,
        })
        .where(eq(calendarConnections.id, CONNECTION_ID));

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
      });

      const { connections } = await getConnectionView();
      const connection = connections.find((c) => c.id === CONNECTION_ID);
      expect(connection).toBeDefined();
      expect(connection?.displayStatus).toBe("connected");
      expect(connection?.stale).toBe(true);
    });

    it("disconnected connection shows displayStatus disconnected but stale false", async () => {
      await setupTest();
      const db = getRequiredTestDb();

      await db
        .update(calendarConnections)
        .set({
          status: "disconnected",
          lastSyncAt: new Date("2026-07-12T12:00:00.000Z"),
        })
        .where(eq(calendarConnections.id, CONNECTION_ID));

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
      });

      const { connections } = await getConnectionView();
      const connection = connections.find((c) => c.id === CONNECTION_ID);
      expect(connection).toBeDefined();
      expect(connection?.displayStatus).toBe("disconnected");
      expect(connection?.stale).toBe(false);
    });
  },
);
