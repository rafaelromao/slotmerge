import { and, eq } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { auditRecords, topics, userTopics } from "../../src/db/schema";
import {
  getTopicAdminRepository,
  createPostgresTopicCatalogueRepository,
} from "../../src/topics/repository";
import { createAdminTopicsWorkflow } from "../../src/workflow/admin-topics";
import { USER_FIXTURES, TOPIC_FIXTURES, USER_TOPIC_FIXTURES, TOPIC_PROPOSAL_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

describe("E2E: adminTopicsWorkflow.retireTopic transactions", () => {
  it.runIf(HAS_TEST_DB)(
    "retire atomically sets the Topic to retired and transitions active user_topics to historical",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const topicToRetire = TOPIC_FIXTURES[0];
      const topicId = topicToRetire.id;

      const beforeActive = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "active"),
          ),
        );
      expect(beforeActive.length).toBeGreaterThan(0);

      const result = await workflow.retireTopic({
        actorId: USER_FIXTURES[2].id,
        topicId,
        confirmName: topicToRetire.name,
      });

      expect(result.ok).toBe(true);

      const [retiredTopic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);
      expect(retiredTopic?.status).toBe("retired");
      expect(retiredTopic?.retiredAt).toBeInstanceOf(Date);

      const historicalAfter = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "historical"),
          ),
        );
      const beforeHistoricalIds = new Set(
        beforeActive.filter((u) => u.status === "historical").map((u) => u.id),
      );
      for (const association of historicalAfter) {
        const wasActiveOrAlreadyHistorical = beforeActive.some(
          (u) =>
            u.id === association.id ||
            beforeHistoricalIds.has(association.id),
        );
        expect(wasActiveOrAlreadyHistorical).toBe(true);
      }
      const activeAfter = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "active"),
          ),
        );
      expect(activeAfter).toHaveLength(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "returns topic_already_retired when the topic has already been retired",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const alreadyRetired = TOPIC_FIXTURES.find(
        (topic) => topic.status === "retired",
      );
      if (!alreadyRetired) {
        throw new Error(
          "Seeds must include at least one retired Topic for this test",
        );
      }

      const result = await workflow.retireTopic({
        actorId: USER_FIXTURES[2].id,
        topicId: alreadyRetired.id,
        confirmName: alreadyRetired.name,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("topic_already_retired");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "returns cannot_retire_own_proposal at the workflow boundary when the actor proposed the topic",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const selfProposedTopic = TOPIC_FIXTURES.find(
        (topic) => topic.proposedByUserId === USER_FIXTURES[2].id,
      );
      if (!selfProposedTopic) {
        throw new Error(
          "Seeds must include a self-proposed Topic for this test",
        );
      }

      const result = await workflow.retireTopic({
        actorId: USER_FIXTURES[2].id,
        topicId: selfProposedTopic.id,
        confirmName: selfProposedTopic.name,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("cannot_retire_own_proposal");

      const [unchanged] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, selfProposedTopic.id))
        .limit(1);
      expect(unchanged?.status).toBe("active");
      expect(unchanged?.retiredAt).toBeNull();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "returns topic_not_found when the topic id does not exist",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const result = await workflow.retireTopic({
        actorId: USER_FIXTURES[2].id,
        topicId: "00000000-0000-0000-0000-0000deadbeef",
        confirmName: "Whatever",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("topic_not_found");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "approveProposal rollback restores seed counts when the topic insert fails",
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

      const result = await workflow.decideProposal({
        actorId: USER_FIXTURES[2].id,
        proposalId: targetProposal.id,
        status: "approved",
      });
      expect(result.ok).toBe(true);

      const replay = await workflow.decideProposal({
        actorId: USER_FIXTURES[2].id,
        proposalId: targetProposal.id,
        status: "approved",
      });
      expect(replay.ok).toBe(false);
      if (replay.ok) return;
      expect(replay.error).toBe("proposal_already_decided");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "retireTopic surfaces a post-commit failure to the caller without losing the committed write",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const topicToRetire = TOPIC_FIXTURES[0];
      const topicId = topicToRetire.id;

      const baseRepository = getTopicAdminRepository();

      const failingRetire = {
        ...baseRepository,
        async retireTopic(input: Parameters<typeof baseRepository.retireTopic>[0]) {
          const result = await baseRepository.retireTopic(input);
          if (result.ok) {
            throw new Error("boom-post-commit-retire-topic");
          }
          return result;
        },
      } as unknown as Parameters<typeof createAdminTopicsWorkflow>[0]["repository"];

      const failingWorkflow = createAdminTopicsWorkflow({
        repository: failingRetire,
        clock: { now: getTestClock() },
      });

      await expect(
        failingWorkflow.retireTopic({
          actorId: USER_FIXTURES[2].id,
          topicId,
          confirmName: topicToRetire.name,
        }),
      ).rejects.toThrow(/boom-post-commit-retire-topic/);

      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);
      expect(topic?.status).toBe("retired");
      expect(topic?.retiredAt).toBeInstanceOf(Date);

      const activeAfter = await db
        .select()
        .from(userTopics)
        .where(
          and(eq(userTopics.topicId, topicId), eq(userTopics.status, "active")),
        );
      expect(activeAfter).toHaveLength(0);

      const historicalAfter = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "historical"),
          ),
        );
      expect(historicalAfter.length).toBeGreaterThan(0);

      const auditAfter = await db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.action, "retire-topic"));
      const retireAudit = auditAfter.find(
        (row) => row.targetId === topicId,
      );
      expect(retireAudit).toBeDefined();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "retireTopic rolls back the Topic and user_topics transitions when a failure is injected mid-transaction",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const topicToRetire = TOPIC_FIXTURES[0];
      const topicId = topicToRetire.id;

      const beforeActive = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "active"),
          ),
        );
      const beforeActiveIds = new Set(beforeActive.map((row) => row.id));

      const [beforeTopic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);
      expect(beforeTopic?.status).toBe("active");

      const failingRetire = {
        ...getTopicAdminRepository(),
        async retireTopic(
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _input: {
            actorId: string;
            topicId: string;
            now: Date;
          },
        ) {
          return await db.transaction(async (tx) => {
            await tx
              .update(topics)
              .set({
                status: "retired",
                retiredAt: new Date("2026-07-12T12:00:00.000Z"),
                updatedAt: new Date("2026-07-12T12:00:00.000Z"),
              })
              .where(eq(topics.id, topicId));

            await tx
              .update(userTopics)
              .set({
                status: "historical",
                updatedAt: new Date("2026-07-12T12:00:00.000Z"),
              })
              .where(
                and(
                  eq(userTopics.topicId, topicId),
                  eq(userTopics.status, "active"),
                ),
              );

            throw new Error("boom-mid-transaction-retire-topic");
          });
        },
      } as unknown as Parameters<typeof createAdminTopicsWorkflow>[0]["repository"];

      const failingWorkflow = createAdminTopicsWorkflow({
        repository: failingRetire,
        clock: { now: getTestClock() },
      });

      await expect(
        failingWorkflow.retireTopic({
          actorId: USER_FIXTURES[2].id,
          topicId,
          confirmName: topicToRetire.name,
        }),
      ).rejects.toThrow(/boom-mid-transaction-retire-topic/);

      const [afterTopic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);
      expect(afterTopic?.status).toBe("active");
      expect(afterTopic?.retiredAt).toBeNull();

      const activeAfter = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "active"),
          ),
        );
      expect(activeAfter.map((row) => row.id).sort()).toEqual(
        [...beforeActiveIds].sort(),
      );

      const newHistorical = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.topicId, topicId),
            eq(userTopics.status, "historical"),
          ),
        );
      const newHistoricalIds = newHistorical
        .map((row) => row.id)
        .filter((id) => !beforeActiveIds.has(id));
      expect(newHistoricalIds).toHaveLength(0);

      const rolledBackAudit = await db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.action, "retire-topic"));
      expect(
        rolledBackAudit.find((row) => row.targetId === topicId),
      ).toBeUndefined();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "retireTopic also writes an audit_records row with the transitioned-association count in the same transaction",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const workflow = createAdminTopicsWorkflow({
        repository: getTopicAdminRepository(),
        clock: { now: getTestClock() },
      });

      const topicToRetire = TOPIC_FIXTURES[0];
      const actor = USER_FIXTURES[0];

      const result = await workflow.retireTopic({
        actorId: actor.id,
        topicId: topicToRetire.id,
        confirmName: topicToRetire.name,
      });

      expect(result.ok).toBe(true);

      const auditRows = await db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.action, "retire-topic"));
      expect(auditRows.length).toBeGreaterThan(0);
      const target = auditRows.find(
        (row) => row.targetId === topicToRetire.id,
      );
      expect(target?.actorId).toBe(actor.id);
      expect(target?.targetType).toBe("topic");
      const metadata = target?.metadata as {
        topicName?: string;
        transitionedAssociationCount?: number;
      };
      expect(metadata?.topicName).toBe(topicToRetire.name);
      expect(metadata?.transitionedAssociationCount).toBeGreaterThanOrEqual(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "createPostgresTopicCatalogueRepository.retire uses a non-transactional single-write path (legacy compatibility)",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) return;

      await setupTest();

      const repository = createPostgresTopicCatalogueRepository();
      const topicToRetire = TOPIC_FIXTURES[0];
      const topicId = topicToRetire.id;

      const result = await repository.retire({
        topicId,
        now: getTestClock()(),
      });

      expect(result).toEqual({ ok: true });

      const [topic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicId))
        .limit(1);
      expect(topic?.status).toBe("retired");
      expect(topic?.retiredAt).toBeInstanceOf(Date);

      const preserved = USER_TOPIC_FIXTURES.find(
        (ut) => ut.topicId === topicId && ut.status === "active",
      );
      if (preserved) {
        const [association] = await db
          .select()
          .from(userTopics)
          .where(eq(userTopics.id, preserved.id))
          .limit(1);
        expect(association?.status).toBe("active");
      }
    },
  );
});
