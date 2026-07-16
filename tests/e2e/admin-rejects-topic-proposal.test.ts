import { eq } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { GET } from "../../app/me/topics/route";
import { createAdminTopicProposalsHandlers } from "../../src/admin/topic-proposals";
import { sealSessionCookie } from "../../src/auth/session";
import {
  sessions,
  topicProposals,
  topics,
  userTopics,
} from "../../src/db/schema";
import { listActiveTopics } from "../../src/topics/repository";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, getTestClock, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const PROPOSER = USER_FIXTURES[0];
const ADMIN = USER_FIXTURES[2];
const PROPOSER_SESSION = SESSION_FIXTURES[0];

function getRequiredTestDb() {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  return db;
}

describe("E2E: Admin rejects a pending Topic Proposal", () => {
  it.runIf(HAS_TEST_DB)(
    "rejects a pending proposal so it does not become active and the proposer sees it as rejected",
    async () => {
      process.env.DATABASE_URL = inject("testDbUrl");
      await setupTest();

      const db = getRequiredTestDb();
      const now = getTestClock()();

      const proposalId = "00000000-0000-0000-0000-0000000000b0";
      const adminSessionId = "00000000-0000-0000-0000-0000000000b1";
      const adminCsrfToken = "admin-reject-csrf-token";
      const candidateName = "Rejected Hobby";

      await db.insert(topicProposals).values({
        id: proposalId,
        proposedByUserId: PROPOSER.id,
        candidateName,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(sessions).values({
        id: adminSessionId,
        userId: ADMIN.id,
        csrfToken: adminCsrfToken,
        expiresAt: new Date("2026-08-12T12:00:00.000Z"),
        createdAt: now,
      });

      const adminCookie = await sealSessionCookie({
        sessionId: adminSessionId,
      });
      const { POST } = createAdminTopicProposalsHandlers();

      const rejectResponse = await POST(
        new Request("http://localhost/admin/topic-proposals", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: adminCookie,
          },
          body: new URLSearchParams({
            id: proposalId,
            action: "reject",
            _csrf: adminCsrfToken,
          }).toString(),
        }),
      );

      expect(rejectResponse.status).toBe(303);
      expect(rejectResponse.headers.get("location")).toBe(
        "http://localhost/admin/topic-proposals",
      );

      const [rejectedProposal] = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.id, proposalId))
        .limit(1);
      expect(rejectedProposal).toBeDefined();
      expect(rejectedProposal.status).toBe("rejected");

      const topicsForCandidate = await db
        .select()
        .from(topics)
        .where(eq(topics.name, candidateName));
      expect(topicsForCandidate).toHaveLength(0);

      const activeCatalogue = await listActiveTopics();
      expect(
        activeCatalogue.some((topic) => topic.name === candidateName),
      ).toBe(false);

      const proposerUserTopics = await db
        .select()
        .from(userTopics)
        .where(eq(userTopics.userId, PROPOSER.id));
      expect(proposerUserTopics).toHaveLength(2);

      const proposerCookie = await sealSessionCookie({
        sessionId: PROPOSER_SESSION.id,
      });
      const meTopicsResponse = await GET(
        new Request("http://localhost/me/topics", {
          headers: { cookie: proposerCookie },
        }),
      );

      expect(meTopicsResponse.status).toBe(200);
      const meTopicsBody = await meTopicsResponse.text();
      const myProposalsStart = meTopicsBody.indexOf('id="my-proposals"');
      expect(myProposalsStart).toBeGreaterThan(-1);
      const myProposalsBlock = meTopicsBody.slice(myProposalsStart);
      expect(myProposalsBlock).toContain(candidateName);
      expect(myProposalsBlock).toContain("(rejected)");
    },
  );
});
