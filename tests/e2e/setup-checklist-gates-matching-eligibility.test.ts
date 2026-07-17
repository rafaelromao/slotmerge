import { describe, expect, inject, it } from "vitest";

import { eq } from "drizzle-orm";
import {
  availabilityWindows,
  calendarConnections,
  users,
  userTopics,
} from "../../src/db/schema";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import {
  createDefaultSearchSnapshotAssemblerDeps,
  SearchSnapshotAssembler,
} from "../../src/search/search-snapshot-assembler";
import { listActiveTopics } from "../../src/topics/repository";
import { getProfileByUserId } from "../../src/profile/repository";
import { TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE_ID = USER_FIXTURES[0].id;
const ORGANIZER_ID = USER_FIXTURES[1].id;
const SELECTED_TOPIC_ID = TOPIC_FIXTURES[0].id;

const SLOT_START = new Date("2026-07-13T15:00:00.000Z");
const RANGE_START = new Date("2026-07-13T00:00:00.000Z");
const RANGE_END = new Date("2026-07-14T00:00:00.000Z");
const DURATION_MINUTES = 60;

async function runMatchingForAlice(): Promise<string[]> {
  const assembler = new SearchSnapshotAssembler(
    createDefaultSearchSnapshotAssemblerDeps({
      clock: { now: getTestClock() },
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
    organizerId: ORGANIZER_ID,
    selectedTopicIds: [SELECTED_TOPIC_ID],
    durationMinutes: DURATION_MINUTES,
    dateRangeStart: RANGE_START,
    dateRangeEnd: RANGE_END,
    organizerTimezone: "UTC",
    minimumMatchingUsers: 1,
  });
  const slotKey = SLOT_START.toISOString();
  const matched = new Set<string>();
  for (const slot of snapshot.slots) {
    if (slot.startUtc !== slotKey) continue;
    for (const match of slot.matches) {
      if (match.userId === ALICE_ID) {
        matched.add(match.userId);
      }
    }
  }
  return Array.from(matched);
}

describe("E2E: setup checklist gates matching eligibility", () => {
  it.runIf(HAS_TEST_DB)(
    "includes the User when every required setup item is complete (positive control)",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await grantDiscoverabilityConsent(ALICE_ID);

      const matches = await runMatchingForAlice();

      expect(matches).toEqual([ALICE_ID]);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "excludes the User when display name is missing",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await db
        .update(users)
        .set({ displayName: null })
        .where(eq(users.id, ALICE_ID));
      await grantDiscoverabilityConsent(ALICE_ID);

      const matches = await runMatchingForAlice();

      expect(matches).not.toContain(ALICE_ID);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "excludes the User when discoverability consent is missing",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const matches = await runMatchingForAlice();

      expect(matches).not.toContain(ALICE_ID);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "excludes the User when no Topic or Topic Proposal is attached",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await db.delete(userTopics).where(eq(userTopics.userId, ALICE_ID));
      await grantDiscoverabilityConsent(ALICE_ID);

      const matches = await runMatchingForAlice();

      expect(matches).not.toContain(ALICE_ID);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "excludes the User when no Availability source is present",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await db
        .delete(availabilityWindows)
        .where(eq(availabilityWindows.userId, ALICE_ID));
      await db
        .delete(calendarConnections)
        .where(eq(calendarConnections.userId, ALICE_ID));
      await grantDiscoverabilityConsent(ALICE_ID);

      const matches = await runMatchingForAlice();

      expect(matches).not.toContain(ALICE_ID);
    },
  );
});