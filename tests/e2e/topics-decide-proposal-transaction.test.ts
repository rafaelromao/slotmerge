import { eq } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { auditRecords, topicProposals, topics } from "../../src/db/schema";
import { getTopicAdminRepository } from "../../src/topics/repository";
import { createAdminTopicsWorkflow } from "../../src/workflow/admin-topics";
import { USER_FIXTURES, TOPIC_PROPOSAL_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

describe("E2E: adminTopicsWorkflow.decideProposal transactions", () => {
  it.runIf(HAS_TEST_DB)(
    "approveProposal atomically creates an active Topic carrying the original proposer and marks the proposal approved",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const targetProposal = TOPIC_PROPOSAL_FIXTURES[0];
      const proposer = USER_FIXTURES[2];
      const before = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.id, targetProposal.id))
        .limit(1);
      expect(before[0]?.status).toBe("pending");

      const result = await workflow.decideProposal({
        actorId: USER_FIXTURES[2].id,
        proposalId: targetProposal.id,
        status: "approved",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const topicId = result.value.topicId;
      expect(topicId).toBeTruthy();

      const [proposal] = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.id, targetProposal.id))
        .limit(1);
      expect(proposal?.status).toBe("approved");

      const [createdTopic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId!))
        .limit(1);
      expect(createdTopic?.status).toBe("active");
      expect(createdTopic?.proposedByUserId).toBe(proposer.id);

      const approveAuditRows = await db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.action, "approve-proposal"));
      expect(approveAuditRows.length).toBeGreaterThan(0);
      const approveAudit = approveAuditRows.find(
        (row) => row.targetId === targetProposal.id,
      );
      expect(approveAudit?.actorId).toBe(USER_FIXTURES[2].id);
      expect(approveAudit?.targetType).toBe("topic-proposal");
      expect((approveAudit?.metadata as { candidateName?: string }).candidateName).toBe(
        targetProposal.candidateName,
      );
    },
  );

  it.runIf(HAS_TEST_DB)(
    "rejectProposal only marks the proposal rejected and does not create a Topic",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const targetProposal = TOPIC_PROPOSAL_FIXTURES[1];

      const beforeTopics = await db
        .select()
        .from(topics)
        .where(eq(topics.name, targetProposal.candidateName));
      expect(beforeTopics).toHaveLength(0);

      const result = await workflow.decideProposal({
        actorId: USER_FIXTURES[2].id,
        proposalId: targetProposal.id,
        status: "rejected",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.topicId).toBeNull();

      const [proposal] = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.id, targetProposal.id))
        .limit(1);
      expect(proposal?.status).toBe("rejected");

      const afterTopics = await db
        .select()
        .from(topics)
        .where(eq(topics.name, targetProposal.candidateName));
      expect(afterTopics).toHaveLength(0);

      const rejectAuditRows = await db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.action, "reject-proposal"));
      expect(rejectAuditRows.length).toBeGreaterThan(0);
      const rejectAudit = rejectAuditRows.find(
        (row) => row.targetId === targetProposal.id,
      );
      expect(rejectAudit?.actorId).toBe(USER_FIXTURES[2].id);
      expect(rejectAudit?.targetType).toBe("topic-proposal");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "approveProposal is idempotent under concurrent decisions — only one Topic and one approved proposal result",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const repository = getTopicAdminRepository();
      const targetProposal = TOPIC_PROPOSAL_FIXTURES[0];

      const [first, second] = await Promise.all([
        repository.decideProposal({
          proposalId: targetProposal.id,
          status: "approved",
          actorId: USER_FIXTURES[2].id,
          now: getTestClock()(),
        }),
        repository.decideProposal({
          proposalId: targetProposal.id,
          status: "approved",
          actorId: USER_FIXTURES[2].id,
          now: getTestClock()(),
        }),
      ]);

      const okCount = [first, second].filter((result) => result.ok).length;
      expect(okCount).toBe(1);

      const topicsWithName = await db
        .select()
        .from(topics)
        .where(eq(topics.name, targetProposal.candidateName));
      expect(topicsWithName).toHaveLength(1);

      const [proposal] = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.id, targetProposal.id))
        .limit(1);
      expect(proposal?.status).toBe("approved");
    },
  );
});
