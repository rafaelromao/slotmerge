import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, inject, it } from "vitest";

import { createAdminTopicsHandlers } from "../../src/admin/topics";
import { sealSessionCookie } from "../../src/auth/session";
import {
  discoverabilityConsents,
  sessions,
  topics,
  userTopics,
} from "../../src/db/schema";
import {
  listActiveTopics,
  saveUserTopicSelection,
} from "../../src/topics/repository";
import { listWeeklyAvailabilityWindowsByUserId } from "../../src/profile/availability-windows";
import { listAvailabilityOverridesByUserId } from "../../src/profile/availability-overrides";
import { getImportedBusyIntervalRepository } from "../../src/calendar/imported-busy-intervals";
import { getProfileByUserId } from "../../src/profile/repository";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import { TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const TOPIC_B = TOPIC_FIXTURES[1];

const SLOT_DATE = "2026-07-13";
const SLOT_START_UTC = `${SLOT_DATE}T16:00:00.000Z`;
const SLOT_END_UTC = `${SLOT_DATE}T17:00:00.000Z`;

describe("E2E: Admin retires an active Topic", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "Slice 1: Admin can retire an active topic, topic transitions to retired status with retiredAt set",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminId = USER_FIXTURES[2].id;
      const topicToRetire = TOPIC_FIXTURES[0];

      const adminSessionId = "00000000-0000-0000-0000-0000000000a1";
      const adminCsrfToken = "admin-csrf-token";

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

      const response = await POST(
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

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost/admin/topics",
      );

      const [retiredTopic] = await db
        .select()
        .from(topics)
        .where(eq(topics.id, topicToRetire.id))
        .limit(1);
      expect(retiredTopic).toBeDefined();
      expect(retiredTopic.status).toBe("retired");
      expect(retiredTopic.retiredAt).toBeInstanceOf(Date);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 2: Past user-topic associations are preserved after topic is retired",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminId = USER_FIXTURES[2].id;
      const topicToRetire = TOPIC_FIXTURES[0];
      const userId = USER_FIXTURES[0].id;

      await saveUserTopicSelection(userId, [topicToRetire.id]);

      const [beforeRetire] = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.userId, userId),
            eq(userTopics.topicId, topicToRetire.id),
          ),
        )
        .limit(1);
      expect(beforeRetire).toBeDefined();
      expect(beforeRetire.status).toBe("active");

      const adminSessionId = "00000000-0000-0000-0000-0000000000a2";
      const adminCsrfToken = "admin-csrf-token-2";

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

      await POST(
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

      const [afterRetire] = await db
        .select()
        .from(userTopics)
        .where(
          and(
            eq(userTopics.userId, userId),
            eq(userTopics.topicId, topicToRetire.id),
          ),
        )
        .limit(1);
      expect(afterRetire).toBeDefined();
      expect(afterRetire.status).toBe("active");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 3: Retired topic is excluded from active catalogue and user topic selection",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminId = USER_FIXTURES[2].id;
      const topicToRetire = TOPIC_FIXTURES[0];

      const adminSessionId = "00000000-0000-0000-0000-0000000000a3";
      const adminCsrfToken = "admin-csrf-token-3";

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

      await POST(
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

      const activeTopics = await listActiveTopics();
      expect(activeTopics.some((t) => t.id === topicToRetire.id)).toBe(false);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 4: Retired topic is silently filtered when user saves topic selection",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminId = USER_FIXTURES[2].id;
      const topicToRetire = TOPIC_FIXTURES[0];
      const userId = USER_FIXTURES[0].id;

      await db.execute(`DELETE FROM user_topics WHERE user_id = '${userId}'`);

      const adminSessionId = "00000000-0000-0000-0000-0000000000a4";
      const adminCsrfToken = "admin-csrf-token-4";

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

      await POST(
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

      const activeTopics = await listActiveTopics();
      expect(activeTopics.some((t) => t.id === topicToRetire.id)).toBe(false);
      expect(activeTopics.some((t) => t.id === TOPIC_B.id)).toBe(true);

      await saveUserTopicSelection(userId, [topicToRetire.id, TOPIC_B.id]);

      const allUserTopics = await db
        .select()
        .from(userTopics)
        .where(eq(userTopics.userId, userId));

      const savedTopicIds = allUserTopics.map((ut) => ut.topicId);
      expect(savedTopicIds).not.toContain(topicToRetire.id);
      expect(savedTopicIds).toContain(TOPIC_B.id);
      expect(savedTopicIds).toHaveLength(1);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "Slice 5: Search rejects retired topic id with validation error",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const now = getTestClock()();
      const adminId = USER_FIXTURES[2].id;
      const topicToRetire = TOPIC_FIXTURES[0];
      const userId = USER_FIXTURES[0].id;

      await db.insert(discoverabilityConsents).values({
        userId,
        grantedAt: now,
      });

      const adminSessionId = "00000000-0000-0000-0000-0000000000a5";
      const adminCsrfToken = "admin-csrf-token-5";

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

      await POST(
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

      setSearchEligibilityProfileInputsForTests({
        [userId]: {
          hasDisplayName: true,
          hasTopicOrProposal: true,
          hasAvailabilitySource: true,
        },
      });

      const matchingDependencies = {
        listSelectedTopicIds: async (uid: string) => {
          const result = await db
            .select({ topicId: userTopics.topicId })
            .from(userTopics)
            .where(
              and(eq(userTopics.userId, uid), eq(userTopics.status, "active")),
            );
          return result.map((r) => r.topicId);
        },
        computeEffectiveAvailability: (
          await import("../../src/matching/effective-availability")
        ).computeEffectiveAvailability,
        getUserAvailabilityData: async (uid: string) => {
          const [profile, windows, overrides, busyIntervals] =
            await Promise.all([
              getProfileByUserId(uid),
              listWeeklyAvailabilityWindowsByUserId(uid),
              listAvailabilityOverridesByUserId(uid),
              getImportedBusyIntervalRepository().findByUserIdAndDateRange(
                uid,
                new Date(0),
                new Date("2100-01-01"),
              ),
            ]);
          return {
            profileTimezone: profile?.profileTimezone ?? "UTC",
            bufferMinutes: profile?.bufferMinutes ?? 0,
            windows,
            overrides,
            busyIntervals,
          };
        },
        isUserEligibleForSearch: (uid: string) =>
          Promise.resolve(uid === userId),
      };

      await expect(async () => {
        await submitSearch(
          {
            organizerId: ORGANIZER.id,
            activeTopicsRepository: {
              async listActive() {
                const catalogue = await db
                  .select()
                  .from(topics)
                  .where(eq(topics.status, "active"));
                return catalogue.map((t) => ({
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
            matchingDependencies,
            discoverableUserRepository:
              createPostgresDiscoverableUserRepository(),
            searchResultRepository: createPostgresSearchResultRepository(),
          },
          {
            selectedTopicIds: [topicToRetire.id],
            minimumMatchingUsers: 1,
            durationMinutes: 60,
            dateRangeStart: new Date(SLOT_START_UTC),
            dateRangeEnd: new Date(SLOT_END_UTC),
            organizerTimezone: ORGANIZER.profileTimezone ?? "UTC",
          },
        );
      }).rejects.toThrow(
        `Topic ${topicToRetire.id} is not in the active Topics catalogue and cannot be used in a Search.`,
      );
    },
  );
});
