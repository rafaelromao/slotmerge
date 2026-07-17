import { and, eq } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { createAdminTopicProposalsHandlers } from "../../src/admin/topic-proposals";
import { sealSessionCookie } from "../../src/auth/session";
import {
  discoverabilityConsents,
  sessions,
  topicProposals,
  topics,
  userTopics,
} from "../../src/db/schema";
import { getProfileByUserId } from "../../src/profile/repository";
import {
  createDefaultSearchSnapshotAssemblerDeps,
  SearchSnapshotAssembler,
} from "../../src/search/search-snapshot-assembler";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import {
  listActiveTopics,
  saveUserTopicSelection,
} from "../../src/topics/repository";
import { USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

describe("E2E: Admin approves a pending Topic Proposal", () => {
  afterEach(() => {
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

      const now = getTestClock()();
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

      await db
        .insert(discoverabilityConsents)
        .values({ userId: proposerId, grantedAt: now });

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

      const assembler = new SearchSnapshotAssembler(
        createDefaultSearchSnapshotAssemblerDeps({
          discoverableUserRepository: createPostgresDiscoverableUserRepository(),
          topicRepository: {
            listActive() {
              return listActiveTopics().then((topics) =>
                topics.map(({ id, name }) => ({
                  id,
                  name,
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
        organizerId: USER_FIXTURES[1].id,
        selectedTopicIds: [approvedTopic.id],
        durationMinutes: 60,
        dateRangeStart: new Date("2026-07-13T00:00:00Z"),
        dateRangeEnd: new Date("2026-07-14T00:00:00Z"),
        organizerTimezone: "UTC",
        minimumMatchingUsers: 1,
        now: getTestClock()(),
      });
      const matches = snapshot.slots.flatMap((s) =>
        s.matches.map((m) => m.userId),
      );
      expect(matches).toContain(proposerId);
    },
  );
});
