import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, inject, it } from "vitest";

import { createAdminTopicProposalsHandlers } from "../../src/admin/topic-proposals";
import { sealSessionCookie } from "../../src/auth/session";
import {
  sessions,
  topicProposals,
  topics,
  userTopics,
} from "../../src/db/schema";
import {
  findEligibleMatches,
  createMatchingDependencies,
} from "../../src/matching";
import {
  clearDiscoverabilityConsentOverride,
  setDiscoverabilityConsentRepositoryForTests,
  type DiscoverabilityConsentRecord,
  type DiscoverabilityConsentRepository,
} from "../../src/profile/discoverability-consent";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import {
  listActiveTopics,
  saveUserTopicSelection,
} from "../../src/topics/repository";
import { FIXTURE_DATE, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

class InMemoryDiscoverabilityConsentRepository implements DiscoverabilityConsentRepository {
  private readonly state = new Map<string, DiscoverabilityConsentRecord>();

  async findByUserId(
    userId: string,
  ): Promise<DiscoverabilityConsentRecord | null> {
    await Promise.resolve();
    return this.state.get(userId) ?? null;
  }

  async grant(userId: string): Promise<DiscoverabilityConsentRecord> {
    await Promise.resolve();
    const record: DiscoverabilityConsentRecord = {
      userId,
      grantedAt: new Date(FIXTURE_DATE),
    };
    this.state.set(userId, record);
    return record;
  }

  async revoke(userId: string): Promise<void> {
    await Promise.resolve();
    this.state.delete(userId);
  }
}

describe("E2E: Admin approves a pending Topic Proposal", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
    clearDiscoverabilityConsentOverride();
  });

  it.runIf(HAS_TEST_DB)(
    "approves a pending proposal so it becomes active, attachable, and participates in matching",
    async () => {
      process.env.DATABASE_URL = inject("testDbUrl");

      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }
      await setupTest();

      const now = new Date(FIXTURE_DATE);
      const proposerId = USER_FIXTURES[0].id;
      const adminId = USER_FIXTURES[2].id;

      const proposalId = "00000000-0000-0000-0000-0000000000a0";
      const adminSessionId = "00000000-0000-0000-0000-0000000000a1";
      const adminCsrfToken = "admin-csrf-token";
      const candidateName = "Sailing";

      await db.insert(topicProposals).values({
        id: proposalId,
        proposedByUserId: proposerId,
        candidateName,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(sessions).values({
        id: adminSessionId,
        userId: adminId,
        csrfToken: adminCsrfToken,
        expiresAt: new Date("2026-08-12T12:00:00.000Z"),
        createdAt: now,
      });

      setSearchEligibilityProfileInputsForTests({
        [proposerId]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
          isActive: true,
        },
      });

      const consentRepo = new InMemoryDiscoverabilityConsentRepository();
      await consentRepo.grant(proposerId);
      setDiscoverabilityConsentRepositoryForTests(consentRepo);

      const adminCookie = await sealSessionCookie({
        sessionId: adminSessionId,
      });
      const { POST } = createAdminTopicProposalsHandlers();

      const approveResponse = await POST(
        new Request("http://localhost/admin/topic-proposals", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: adminCookie,
          },
          body: new URLSearchParams({
            id: proposalId,
            action: "approve",
            _csrf: adminCsrfToken,
          }).toString(),
        }),
      );

      expect(approveResponse.status).toBe(303);
      expect(approveResponse.headers.get("location")).toBe(
        "http://localhost/admin/topic-proposals",
      );

      const [approvedProposal] = await db
        .select()
        .from(topicProposals)
        .where(eq(topicProposals.id, proposalId))
        .limit(1);
      expect(approvedProposal).toBeDefined();
      expect(approvedProposal.status).toBe("approved");

      const approvedTopics = await db
        .select()
        .from(topics)
        .where(eq(topics.name, candidateName));
      expect(approvedTopics).toHaveLength(1);
      const approvedTopic = approvedTopics[0];
      expect(approvedTopic.status).toBe("active");

      const activeCatalogue = await listActiveTopics();
      expect(activeCatalogue.some((t) => t.id === approvedTopic.id)).toBe(true);

      await saveUserTopicSelection(proposerId, [approvedTopic.id]);

      const [attached] = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.userId, proposerId),
            eq(userTopics.topicId, approvedTopic.id),
          ),
        )
        .limit(1);
      expect(attached).toBeDefined();
      expect(attached.status).toBe("active");

      const matches = await findEligibleMatches(
        {
          organizerId: USER_FIXTURES[1].id,
          selectedTopicIds: [approvedTopic.id],
          candidateUserIds: [proposerId],
          durationMinutes: 60,
          rangeStart: new Date("2026-07-13T00:00:00Z"),
          rangeEnd: new Date("2026-07-14T00:00:00Z"),
        },
        createMatchingDependencies(),
      );
      expect(matches).toContain(proposerId);
    },
  );
});
