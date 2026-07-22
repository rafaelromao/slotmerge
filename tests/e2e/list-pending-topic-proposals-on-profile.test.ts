import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import {
  clearPerUserLookupStateForTests,
  GET as meGet,
  setPerUserLookupStateForTests,
} from "../../app/api/v1/me/route";
import { GET as getMyTopics } from "../../app/api/v1/me/topics/route";
import { POST as postPropose } from "../../app/api/v1/me/topics/propose/route";
import { sealSessionCookie } from "../../src/auth/session";
import { topicProposals, type TopicProposalStatus } from "../../src/db/schema";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const SESSION = SESSION_FIXTURES[0];
const USER = USER_FIXTURES[0];
const PROPOSAL_CANDIDATE_NAME = "Sailing";

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

async function clearUserTopicProposals(): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM topic_proposals WHERE proposed_by_user_id = '${USER.id}'`,
  );
}

async function clearUserTopics(): Promise<void> {
  await getRequiredTestDb().execute(
    `DELETE FROM user_topics WHERE user_id = '${USER.id}'`,
  );
}

async function submitProposal(candidateName: string): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION.id });
  return postPropose(
    new Request("http://localhost/me/topics/propose", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        candidateName,
        csrfToken: SESSION.csrfToken,
      }).toString(),
    }),
  );
}

async function fetchMyTopicsPage(): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION.id });
  return getMyTopics(
    new Request("http://localhost/me/topics", {
      headers: { cookie },
    }),
  );
}

describe("E2E: list pending Topic Proposals on profile", () => {
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
    "submits a proposal and renders it on My Topics with pending state awaiting Admin review",
    async () => {
      await setupTest();
      await clearUserTopicProposals();

      const submitResponse = await submitProposal(PROPOSAL_CANDIDATE_NAME);
      expect(submitResponse.status).toBe(303);

      const persisted = await getRequiredTestDb()
        .select({
          id: topicProposals.id,
          candidateName: topicProposals.candidateName,
          status: topicProposals.status,
          proposedByUserId: topicProposals.proposedByUserId,
        })
        .from(topicProposals)
        .where(eq(topicProposals.proposedByUserId, USER.id));
      expect(persisted).toHaveLength(1);
      expect(persisted[0].candidateName).toBe(PROPOSAL_CANDIDATE_NAME);
      expect(persisted[0].status).toBe("pending");

      const pageResponse = await fetchMyTopicsPage();
      expect(pageResponse.status).toBe(200);
      const html = await pageResponse.text();

      expect(html).toContain("My Proposals");
      expect(html).toContain(PROPOSAL_CANDIDATE_NAME);
      expect(html).toContain("(pending)");
      expect(html).not.toContain("(approved)");
      expect(html).not.toContain("(rejected)");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "pending proposal counts toward the hasTopic setup completion item",
    async () => {
      await setupTest();
      await clearUserTopicProposals();
      await clearUserTopics();

      const submitResponse = await submitProposal(PROPOSAL_CANDIDATE_NAME);
      expect(submitResponse.status).toBe(303);

      const persisted = await getRequiredTestDb()
        .select({
          id: topicProposals.id,
          candidateName: topicProposals.candidateName,
          status: topicProposals.status,
        })
        .from(topicProposals)
        .where(eq(topicProposals.proposedByUserId, USER.id));
      const proposal = persisted[0];

      setPerUserLookupStateForTests({
        topicsByUserId: new Map<string, Array<{ id: string; name: string }>>([
          [USER.id, []],
        ]),
        topicProposalsByUserId: new Map<
          string,
          Array<{ id: string; name: string; status: TopicProposalStatus }>
        >([
          [
            USER.id,
            [
              {
                id: proposal.id,
                name: proposal.candidateName,
                status: proposal.status,
              },
            ],
          ],
        ]),
      });

      const cookie = await sealSessionCookie({ sessionId: SESSION.id });
      const meResponse = await meGet(
        new Request("http://localhost/me", { headers: { cookie } }),
      );
      expect(meResponse.status).toBe(200);
      const body = (await meResponse.json()) as {
        topics: Array<{ id: string; name: string }>;
        topicProposals: Array<{ id: string; name: string; status: string }>;
        setup: { items: Array<{ key: string; complete: boolean }> };
      };

      expect(body.topics).toEqual([]);
      expect(body.topicProposals).toContainEqual({
        id: proposal.id,
        name: PROPOSAL_CANDIDATE_NAME,
        status: "pending",
      });

      const hasTopicItem = body.setup.items.find(
        (item) => item.key === "hasTopic",
      );
      expect(hasTopicItem?.complete).toBe(true);
    },
  );
});
