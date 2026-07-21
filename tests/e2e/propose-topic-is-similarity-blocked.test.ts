import { eq } from "drizzle-orm";
import Iron from "@hapi/iron";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { POST as postPropose } from "../../app/me/topics/propose/route";
import { GET as getMyTopics } from "../../app/me/topics/route";
import { clearPerUserLookupStateForTests } from "../../app/me/route";
import { sealSessionCookie } from "../../src/auth/session";
import { topicProposals } from "../../src/db/schema";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

describe("E2E: propose a new Topic is similarity-blocked", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.SESSION_SECRET = "test-session-secret-80-characters-long";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    clearPerUserLookupStateForTests();
  });

  it.runIf(HAS_TEST_DB)(
    "proposing a name similar to an existing active topic is blocked with 'too similar' error and nothing is persisted",
    async () => {
      await setupTest();

      const session = SESSION_FIXTURES[0];
      const userId = USER_FIXTURES[0].id;

      const cookie = await sealSessionCookie({ sessionId: session.id });
      const response = await postPropose(
        new Request("http://localhost/me/topics/propose", {
          method: "POST",
          headers: {
            cookie,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            candidateName: "Product strateg",
            csrfToken: session.csrfToken,
          }).toString(),
        }),
      );

      expect(response.status).toBe(303);

      const location = response.headers.get("Location");
      expect(location).toContain("feedback=");
      const feedbackParam = new URL(location!).searchParams.get("feedback");
      expect(feedbackParam).toBeTruthy();
      const unsealed = (await Iron.unseal(
        feedbackParam!,
        "test-session-secret-80-characters-long",
        Iron.defaults,
      )) as { type: string; names?: string[] };
      expect(unsealed.type).toBe("too_similar");
      expect(unsealed.names).toContain("Product strategy");

      const pageResponse = await getMyTopics(
        new Request(
          `http://localhost/me/topics${location!.split("?")[1] ? `?${location!.split("?")[1]}` : ""}`,
          {
            headers: { cookie },
          },
        ),
      );
      expect(pageResponse.status).toBe(200);
      const pageHtml = await pageResponse.text();
      expect(pageHtml).toContain("Too similar to existing");
      expect(pageHtml).toContain("Product strategy");

      const db = getRequiredTestDb();
      const proposals = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.proposedByUserId, userId));
      expect(proposals).toHaveLength(0);
    },
  );
});
