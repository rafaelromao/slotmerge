import { afterEach, describe, expect, inject, it } from "vitest";

import {
  createMatchingDependencies,
  findEligibleMatches,
} from "../../src/matching";
import { grantDiscoverabilityConsent } from "../../src/profile/discoverability-consent";
import { setSearchEligibilityProfileInputsForTests } from "../../src/search/eligibility";
import { TOPIC_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

const ALICE_ID = USER_FIXTURES[0].id;
const ORGANIZER_ID = USER_FIXTURES[1].id;
const SELECTED_TOPIC_ID = TOPIC_FIXTURES[0].id;

const SLOT_START = new Date("2026-07-13T15:00:00.000Z");
const RANGE_START = new Date("2026-07-13T00:00:00.000Z");
const RANGE_END = new Date("2026-07-14T00:00:00.000Z");
const DURATION_MINUTES = 60;

const COMPLETE_ELIGIBILITY = {
  hasDisplayName: true,
  hasTopicOrProposal: true,
  hasAvailabilitySource: true,
  isActive: true,
} as const;

async function runMatchingForAlice(): Promise<string[]> {
  return findEligibleMatches(
    {
      organizerId: ORGANIZER_ID,
      selectedTopicIds: [SELECTED_TOPIC_ID],
      candidateUserIds: [ALICE_ID],
      durationMinutes: DURATION_MINUTES,
      rangeStart: RANGE_START,
      rangeEnd: RANGE_END,
      slotStart: SLOT_START,
    },
    createMatchingDependencies(),
  );
}

describe("E2E: setup checklist gates matching eligibility", () => {
  afterEach(() => {
    setSearchEligibilityProfileInputsForTests(null);
  });

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
      setSearchEligibilityProfileInputsForTests({
        [ALICE_ID]: COMPLETE_ELIGIBILITY,
      });

      const matches = await runMatchingForAlice();

      expect(matches).toContain(ALICE_ID);
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
      await grantDiscoverabilityConsent(ALICE_ID);
      setSearchEligibilityProfileInputsForTests({
        [ALICE_ID]: {
          ...COMPLETE_ELIGIBILITY,
          hasDisplayName: false,
        },
      });

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
      setSearchEligibilityProfileInputsForTests({
        [ALICE_ID]: COMPLETE_ELIGIBILITY,
      });

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
      await grantDiscoverabilityConsent(ALICE_ID);
      setSearchEligibilityProfileInputsForTests({
        [ALICE_ID]: {
          ...COMPLETE_ELIGIBILITY,
          hasTopicOrProposal: false,
        },
      });

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
      await grantDiscoverabilityConsent(ALICE_ID);
      setSearchEligibilityProfileInputsForTests({
        [ALICE_ID]: {
          ...COMPLETE_ELIGIBILITY,
          hasAvailabilitySource: false,
        },
      });

      const matches = await runMatchingForAlice();

      expect(matches).not.toContain(ALICE_ID);
    },
  );
});
