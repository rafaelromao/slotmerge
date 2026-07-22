import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { GET, PUT } from "../../app/api/v1/me/topics/route";
import { sealSessionCookie } from "../../src/auth/session";
import {
  SESSION_FIXTURES,
  TOPIC_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const SESSION = SESSION_FIXTURES[0];
const USER = USER_FIXTURES[0];

type UserTopicRow = {
  topic_id: string;
  status: string;
};

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

async function clearUserTopics(): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM user_topics WHERE user_id = '${USER.id}'`,
  );
}

async function submitTopicSelection(topicIds: string[]): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION.id });

  return PUT(
    new Request("http://localhost/me/topics", {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        topicIds,
        csrfToken: SESSION.csrfToken,
      }),
    }),
  );
}

async function readUserTopics(): Promise<UserTopicRow[]> {
  const result = await getRequiredTestDb().execute<UserTopicRow>(
    `SELECT topic_id, status FROM user_topics WHERE user_id = '${USER.id}' ORDER BY topic_id`,
  );
  return result.rows;
}

describe("E2E: User attaches active Topics from the catalogue", () => {
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

  it.runIf(HAS_TEST_DB)(
    "shows only active Topics in the authenticated User catalogue",
    async () => {
      await setupTest();

      const cookie = await sealSessionCookie({ sessionId: SESSION.id });
      const response = await GET(
        new Request("http://localhost/me/topics", {
          headers: { cookie },
        }),
      );
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain(TOPIC_FIXTURES[0].name);
      expect(body).toContain(TOPIC_FIXTURES[1].name);
      expect(body).not.toContain(TOPIC_FIXTURES[2].name);
      expect(body).not.toContain(TOPIC_FIXTURES[3].name);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "attaches two active Topics and persists active associations",
    async () => {
      await setupTest();

      await clearUserTopics();

      const response = await submitTopicSelection([
        TOPIC_FIXTURES[0].id,
        TOPIC_FIXTURES[1].id,
      ]);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(await readUserTopics()).toEqual([
        { topic_id: TOPIC_FIXTURES[0].id, status: "active" },
        { topic_id: TOPIC_FIXTURES[1].id, status: "active" },
      ]);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "does not persist a retired Topic from a selection",
    async () => {
      await setupTest();

      await clearUserTopics();

      const response = await submitTopicSelection([
        TOPIC_FIXTURES[0].id,
        TOPIC_FIXTURES[3].id,
      ]);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(await readUserTopics()).toEqual([
        { topic_id: TOPIC_FIXTURES[0].id, status: "active" },
      ]);
    },
  );
});
