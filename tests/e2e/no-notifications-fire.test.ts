import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, inject, it } from "vitest";

import { POST as postPropose } from "../../app/me/topics/propose/route";
import { createAdminTopicsHandlers } from "../../src/admin/topics";
import { createAdminTopicProposalsHandlers } from "../../src/admin/topic-proposals";
import { sealSessionCookie } from "../../src/auth/session";
import { setEmailDeliveryServiceForTests } from "../../src/calendar/action-required-email-singleton";
import {
  buildMockEmailAdapter,
  type MockEmailAdapter,
} from "../mock-email-adapter";
import type { EmailDeliveryService } from "../../src/email/service";
import {
  topicProposals,
  sessions,
  discoverabilityConsents,
} from "../../src/db/schema";
import {
  TOPIC_FIXTURES,
  USER_FIXTURES,
  SESSION_FIXTURES,
} from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const SESSION_SECRET = "test-session-secret-124-characters-long";

function buildEmailDeliveryService(
  adapter: MockEmailAdapter,
): EmailDeliveryService {
  return {
    async sendEmail(input) {
      await adapter.send({
        emailEventId: `mock-${input.recipient}`,
        recipient: input.recipient,
        type: input.type,
        payload: input.payload,
      });
      return {
        emailEvent: {
          id: `mock-${input.recipient}`,
          recipient: input.recipient,
          type: input.type,
          payloadReference: "mock-ref",
          status: "sent" as const,
          attempts: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          sentAt: new Date(),
          failedAt: null,
          lastAttemptAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      };
    },
  };
}

describe("E2E: no notifications fire for matches, RSVPs, bookings, reminders, or Topic Proposals", () => {
  let emailAdapter: MockEmailAdapter;

  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.SESSION_SECRET = SESSION_SECRET;
  });

  afterEach(() => {
    if (emailAdapter) {
      emailAdapter.reset();
    }
    setEmailDeliveryServiceForTests(null);
  });

  describe("Slice 1: Matching produces no email notifications", () => {
    it.runIf(HAS_TEST_DB)(
      "submitting a Search that produces matches records zero email sends",
      async () => {
        await setupTest();

        emailAdapter = buildMockEmailAdapter();
        setEmailDeliveryServiceForTests(
          buildEmailDeliveryService(emailAdapter),
        );

        const { submitSearch } = await import("../../src/search/search-input");
        const { createMatchingDependencies } =
          await import("../../src/matching");
        const { createPostgresDiscoverableUserRepository } =
          await import("../../src/search/drizzle-discoverable-user-repository");
        const { createPostgresSearchResultRepository } =
          await import("../../src/search/drizzle-search-result-repository");
        const { getTopicCatalogueRepository } =
          await import("../../src/topics/repository");
        const { getProfileByUserId } =
          await import("../../src/profile/repository");
        const { setSearchEligibilityProfileInputsForTests } =
          await import("../../src/search/eligibility");

        const db = getTestDb()!;
        const now = getTestClock()();

        await db.insert(discoverabilityConsents).values({
          userId: USER_FIXTURES[0].id,
          grantedAt: now,
        });
        await db.insert(discoverabilityConsents).values({
          userId: USER_FIXTURES[1].id,
          grantedAt: now,
        });

        setSearchEligibilityProfileInputsForTests({
          [USER_FIXTURES[0].id]: {
            hasDisplayName: true,
            hasTopicOrProposal: true,
            hasAvailabilitySource: true,
          },
          [USER_FIXTURES[1].id]: {
            hasDisplayName: true,
            hasTopicOrProposal: true,
            hasAvailabilitySource: true,
          },
        });

        const result = await submitSearch(
          {
            organizerId: USER_FIXTURES[1].id,
            activeTopicsRepository: {
              async listActive() {
                const catalogue =
                  await getTopicCatalogueRepository().listCatalogue();
                return catalogue
                  .filter((t) => t.status === "active")
                  .map((t) => ({
                    id: t.id,
                    name: t.name,
                    status: "active" as const,
                  }));
              },
            },
            profileRepository: {
              async findByUserId(uid) {
                return getProfileByUserId(uid);
              },
            },
            clock: { now: getTestClock() },
            matchingPoolSize: 2,
            matchingDependencies: createMatchingDependencies(),
            discoverableUserRepository:
              createPostgresDiscoverableUserRepository(),
            searchResultRepository: createPostgresSearchResultRepository(),
          },
          {
            selectedTopicIds: [TOPIC_FIXTURES[0].id, TOPIC_FIXTURES[1].id],
            minimumMatchingUsers: 2,
            durationMinutes: 60,
            dateRangeStart: new Date("2026-07-13T00:00:00.000Z"),
            dateRangeEnd: new Date("2026-07-14T00:00:00.000Z"),
            organizerTimezone: "America/Los_Angeles",
          },
        );

        expect(result.ok).toBe(true);
        expect(emailAdapter.sends).toHaveLength(0);
      },
    );
  });

  describe("Slice 2: Topic Proposal submission produces no email notifications", () => {
    it.runIf(HAS_TEST_DB)(
      "submitting a Topic Proposal records zero email sends",
      async () => {
        await setupTest();

        emailAdapter = buildMockEmailAdapter();
        setEmailDeliveryServiceForTests(
          buildEmailDeliveryService(emailAdapter),
        );

        const session = SESSION_FIXTURES[0];
        const cookie = await sealSessionCookie({ sessionId: session.id });

        const response = await postPropose(
          new Request("http://localhost/me/topics/propose", {
            method: "POST",
            headers: {
              cookie,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              candidateName: "Sailing",
              csrfToken: session.csrfToken,
            }).toString(),
          }),
        );

        expect(response.status).toBe(303);
        expect(emailAdapter.sends).toHaveLength(0);
      },
    );
  });

  describe("Slice 3: Topic Proposal rejection produces no email notifications", () => {
    it.runIf(HAS_TEST_DB)(
      "admin rejecting a Topic Proposal records zero email sends",
      async () => {
        await setupTest();

        emailAdapter = buildMockEmailAdapter();
        setEmailDeliveryServiceForTests(
          buildEmailDeliveryService(emailAdapter),
        );

        const db = getTestDb()!;
        const now = getTestClock()();

        const proposerId = USER_FIXTURES[0].id;
        const adminId = USER_FIXTURES[2].id;
        const proposalId = "00000000-0000-0000-0000-000000009901";
        const adminSessionId = "00000000-0000-0000-0000-000000009902";
        const adminCsrfToken = "reject-csrf-token";

        await db.insert(topicProposals).values({
          id: proposalId,
          proposedByUserId: proposerId,
          candidateName: "Sailing",
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

        const [rejected] = await db
          .select()
          .from(topicProposals)
          .where(eq(topicProposals.id, proposalId))
          .limit(1);
        expect(rejected.status).toBe("rejected");

        expect(emailAdapter.sends).toHaveLength(0);
      },
    );
  });

  describe("Slice 4: Topic retirement produces no email notifications", () => {
    it.runIf(HAS_TEST_DB)(
      "admin retiring an active Topic records zero email sends",
      async () => {
        await setupTest();

        emailAdapter = buildMockEmailAdapter();
        setEmailDeliveryServiceForTests(
          buildEmailDeliveryService(emailAdapter),
        );

        const db = getTestDb()!;
        const now = getTestClock()();
        const adminId = USER_FIXTURES[2].id;
        const topicToRetire = TOPIC_FIXTURES[0];
        const adminSessionId = "00000000-0000-0000-0000-000000009903";
        const adminCsrfToken = "retire-csrf-token";

        await db.insert(sessions).values({
          id: adminSessionId,
          userId: adminId,
          csrfToken: adminCsrfToken,
          expiresAt: new Date("2026-08-12T12:00:00.000Z"),
          createdAt: now,
        });

        const adminCookie = await sealSessionCookie({
          sessionId: adminSessionId,
        });
        const { POST } = createAdminTopicsHandlers();

        const retireResponse = await POST(
          new Request("http://localhost/admin/topics", {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              cookie: adminCookie,
            },
            body: new URLSearchParams({
              id: topicToRetire.id,
              action: "retire",
              _csrf: adminCsrfToken,
            }).toString(),
          }),
        );

        expect(retireResponse.status).toBe(303);
        expect(emailAdapter.sends).toHaveLength(0);
      },
    );
  });
});
