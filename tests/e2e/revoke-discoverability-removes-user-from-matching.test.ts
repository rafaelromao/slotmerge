import { afterEach, describe, expect, inject, it } from "vitest";
import { eq } from "drizzle-orm";

import { DELETE } from "../../app/me/discoverability-consent/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import {
  discoverabilityConsents,
  users,
  userTopics,
  availabilityWindows,
} from "../../src/db/schema";
import { createMatchingDependencies } from "../../src/matching";
import {
  getDiscoverabilityConsent,
  grantDiscoverabilityConsent,
} from "../../src/profile/discoverability-consent";
import { getProfileByUserId } from "../../src/profile/repository";
import { createPostgresDiscoverableUserRepository } from "../../src/search/drizzle-discoverable-user-repository";
import { createPostgresSearchResultRepository } from "../../src/search/drizzle-search-result-repository";
import {
  type ProfileInputs,
  setSearchEligibilityProfileInputsForTests,
} from "../../src/search/eligibility";
import { submitSearch } from "../../src/search/search-input";
import { listActiveTopics } from "../../src/topics/repository";
import {
  FIXTURE_DATE,
  SESSION_FIXTURES,
  TOPIC_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ORGANIZER = USER_FIXTURES[2];
const ALICE_ID = USER_FIXTURES[0].id;
const BOB_ID = USER_FIXTURES[1].id;
const SELECTED_TOPIC = TOPIC_FIXTURES[0];
const SESSION_ID = SESSION_FIXTURES[0].id;
const CSRF_TOKEN = SESSION_FIXTURES[0].csrfToken;

const SLOT_START_UTC = "2026-07-13T16:00:00.000Z";
const SLOT_END_UTC = "2026-07-13T17:00:00.000Z";
const DURATION_MINUTES = 60;
const MINIMUM_MATCHING_USERS = 2;
const MATCHING_POOL_SIZE = 3;

const EXTRA_DISCOVERABLE_USER_ID = "00000000-0000-0000-0000-0000000001f1";
const EXTRA_DISCOVERABLE_USER_EMAIL = "extra-discoverable@example.com";
const EXTRA_DISCOVERABLE_USER_DISPLAY_NAME = "Extra Discoverable User";
const EXTRA_USER_TOPIC_ROW_ID = "00000000-0000-0000-0000-0000000001f2";
const EXTRA_AVAILABILITY_WINDOW_ID = "00000000-0000-0000-0000-0000000001f3";

const COMPLETE_PROFILE: ProfileInputs = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: true,
};

const ELIGIBILITY_INPUTS: Record<string, ProfileInputs> = {
  [ALICE_ID]: COMPLETE_PROFILE,
  [BOB_ID]: COMPLETE_PROFILE,
  [EXTRA_DISCOVERABLE_USER_ID]: COMPLETE_PROFILE,
};

type SearchSnapshotShape = {
  slots: Array<{
    startUtc: string;
    matchCount: number;
    matches: Array<{ userId: string }>;
  }>;
};

function aliceSession() {
  return {
    user: {
      id: ALICE_ID,
      email: USER_FIXTURES[0].email,
      displayName: USER_FIXTURES[0].displayName,
      avatarUrl: null,
      shortBio: null,
      role: USER_FIXTURES[0].role,
      status: USER_FIXTURES[0].status,
      profileTimezone: USER_FIXTURES[0].profileTimezone,
      bufferMinutes: USER_FIXTURES[0].bufferMinutes,
    },
    csrfToken: CSRF_TOKEN,
  };
}

async function insertExtraDiscoverableUser(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE);
  await db.insert(users).values({
    id: EXTRA_DISCOVERABLE_USER_ID,
    email: EXTRA_DISCOVERABLE_USER_EMAIL,
    displayName: EXTRA_DISCOVERABLE_USER_DISPLAY_NAME,
    role: "user",
    status: "active",
    profileTimezone: "UTC",
    bufferMinutes: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(availabilityWindows).values({
    id: EXTRA_AVAILABILITY_WINDOW_ID,
    userId: EXTRA_DISCOVERABLE_USER_ID,
    dayOfWeek: 1,
    startTime: "00:00",
    endTime: "23:59",
    profileTimezone: "UTC",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(userTopics).values({
    id: EXTRA_USER_TOPIC_ROW_ID,
    userId: EXTRA_DISCOVERABLE_USER_ID,
    topicId: SELECTED_TOPIC.id,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function loadDiscoverabilityRowCount(userId: string): Promise<number> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const rows = await db
    .select({ userId: discoverabilityConsents.userId })
    .from(discoverabilityConsents)
    .where(eq(discoverabilityConsents.userId, userId));
  return rows.length;
}

async function loadSnapshot(searchId: string): Promise<SearchSnapshotShape> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ snapshot_json: unknown }>(
    `SELECT snapshot_json FROM search_results WHERE search_id = '${searchId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`no search_results row for search_id ${searchId}`);
  }
  return row.snapshot_json as SearchSnapshotShape;
}

function matchedUserIds(snapshot: SearchSnapshotShape): string[] {
  return snapshot.slots.flatMap((s) => s.matches.map((m) => m.userId));
}

async function submitDiscoverableSearch(): Promise<string> {
  const result = await submitSearch(
    {
      organizerId: ORGANIZER.id,
      activeTopicsRepository: {
        async listActive() {
          return (await listActiveTopics()).map(({ id, name }) => ({
            id,
            name,
            status: "active" as const,
          }));
        },
      },
      profileRepository: { findByUserId: getProfileByUserId },
      clock: { now: getTestClock() },
      matchingPoolSize: MATCHING_POOL_SIZE,
      matchingDependencies: createMatchingDependencies(),
      discoverableUserRepository: createPostgresDiscoverableUserRepository(),
      searchResultRepository: createPostgresSearchResultRepository(),
    },
    {
      selectedTopicIds: [SELECTED_TOPIC.id],
      minimumMatchingUsers: MINIMUM_MATCHING_USERS,
      durationMinutes: DURATION_MINUTES,
      dateRangeStart: new Date(SLOT_START_UTC),
      dateRangeEnd: new Date(SLOT_END_UTC),
      organizerTimezone: ORGANIZER.profileTimezone ?? "UTC",
    },
  );

  expect(result.ok).toBe(true);
  if (!result.ok || !result.search.id) {
    throw new Error("expected Search submission to succeed");
  }
  return result.search.id;
}

async function callRevokeRoute(): Promise<{
  status: number;
  body: { discoverability: { consented: boolean } };
}> {
  const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
  const response = await DELETE(
    new Request("http://localhost/me/discoverability-consent", {
      method: "DELETE",
      headers: {
        cookie,
        "x-csrf-token": CSRF_TOKEN,
      },
    }),
  );
  const body = (await response.json()) as {
    discoverability: { consented: boolean };
  };
  return { status: response.status, body };
}

describe("E2E: revoke discoverability removes User from matching", () => {
  afterEach(() => {
    setSessionRepositoryForTests(null);
    setSearchEligibilityProfileInputsForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "DELETE /me/discoverability-consent removes the consent row and the revoked User no longer appears in a subsequent persisted Search Result snapshot",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertExtraDiscoverableUser();

      await grantDiscoverabilityConsent(ALICE_ID);
      await grantDiscoverabilityConsent(BOB_ID);
      await grantDiscoverabilityConsent(EXTRA_DISCOVERABLE_USER_ID);

      expect(await getDiscoverabilityConsent(ALICE_ID)).not.toBeNull();

      setSearchEligibilityProfileInputsForTests(ELIGIBILITY_INPUTS);
      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
      });

      const revokeResult = await callRevokeRoute();
      expect(revokeResult.status).toBe(200);
      expect(revokeResult.body.discoverability.consented).toBe(false);

      expect(await getDiscoverabilityConsent(ALICE_ID)).toBeNull();
      expect(await loadDiscoverabilityRowCount(ALICE_ID)).toBe(0);

      const afterSnapshot = await loadSnapshot(
        await submitDiscoverableSearch(),
      );
      const afterMatches = matchedUserIds(afterSnapshot);

      expect(afterMatches).not.toContain(ALICE_ID);
      expect(afterMatches).toEqual(
        expect.arrayContaining([BOB_ID, EXTRA_DISCOVERABLE_USER_ID]),
      );
      expect(afterSnapshot.slots[0]?.matchCount).toBe(2);
    },
  );
});
