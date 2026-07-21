import { describe, expect, inject, it } from "vitest";

import { computeEffectiveAvailability } from "../../src/matching/effective-availability";
import {
  addAvailabilityOverride,
  expandOverrideToUtcRange,
  listAvailabilityOverridesByUserId,
} from "../../src/profile/availability-overrides";
import {
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const FIXTURE_USER = USER_FIXTURES[0];
const FIXTURE_TIMEZONE = FIXTURE_USER.profileTimezone;
const NEW_OVERRIDE_DATE = "2026-07-22";
const NEW_OVERRIDE_START = "19:00";
const NEW_OVERRIDE_END = "20:00";
const NEW_OVERRIDE_TYPE = "add" as const;

describe("E2E: persist one-off add Availability override and surface it from the effective Availability helper", () => {
  it.runIf(HAS_TEST_DB)(
    "addAvailabilityOverride persists an add override on a day with no weekly window",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const override = await addAvailabilityOverride(
        FIXTURE_USER.id,
        {
          date: NEW_OVERRIDE_DATE,
          startTime: NEW_OVERRIDE_START,
          endTime: NEW_OVERRIDE_END,
          type: NEW_OVERRIDE_TYPE,
        },
        FIXTURE_TIMEZONE,
      );

      expect(override.id).toBeTruthy();
      expect(override.date).toBe(NEW_OVERRIDE_DATE);
      expect(override.startTime).toBe(NEW_OVERRIDE_START);
      expect(override.endTime).toBe(NEW_OVERRIDE_END);
      expect(override.type).toBe(NEW_OVERRIDE_TYPE);
      expect(override.profileTimezone).toBe(FIXTURE_TIMEZONE);

      const persisted = await db.execute<{
        date: string;
        start_time: string;
        end_time: string;
        type: string;
        profile_timezone: string;
      }>(
        `SELECT date, start_time, end_time, type, profile_timezone
         FROM availability_overrides
         WHERE user_id = '${FIXTURE_USER.id}' AND date = '${NEW_OVERRIDE_DATE}'`,
      );

      expect(persisted.rows).toHaveLength(1);
      const row = persisted.rows[0];
      expect(row.date).toBe(NEW_OVERRIDE_DATE);
      expect(row.start_time).toBe(NEW_OVERRIDE_START);
      expect(row.end_time).toBe(NEW_OVERRIDE_END);
      expect(row.type).toBe(NEW_OVERRIDE_TYPE);
      expect(row.profile_timezone).toBe(FIXTURE_TIMEZONE);

      const reloaded = await db.execute<{ count: string }>(
        `SELECT COUNT(*) as count FROM availability_overrides`,
      );
      expect(Number(reloaded.rows[0].count)).toBeGreaterThan(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "computeEffectiveAvailability includes the persisted override read back from the database",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      await addAvailabilityOverride(
        FIXTURE_USER.id,
        {
          date: NEW_OVERRIDE_DATE,
          startTime: NEW_OVERRIDE_START,
          endTime: NEW_OVERRIDE_END,
          type: NEW_OVERRIDE_TYPE,
        },
        FIXTURE_TIMEZONE,
      );

      const overrides = await listAvailabilityOverridesByUserId(FIXTURE_USER.id);
      const windows: import("../../src/profile/availability-windows").WeeklyAvailabilityWindow[] =
        [];

      const expectedRange = expandOverrideToUtcRange(
        {
          date: NEW_OVERRIDE_DATE,
          startTime: NEW_OVERRIDE_START,
          endTime: NEW_OVERRIDE_END,
          type: NEW_OVERRIDE_TYPE,
        },
        FIXTURE_TIMEZONE,
      );

      const paddingMs = 60 * 60 * 1000;
      const rangeStart = new Date(
        expectedRange.startUtc.getTime() - paddingMs,
      );
      const rangeEnd = new Date(
        expectedRange.endUtc.getTime() + paddingMs,
      );

      const effective = computeEffectiveAvailability({
        userId: FIXTURE_USER.id,
        profileTimezone: FIXTURE_TIMEZONE,
        bufferMinutes: FIXTURE_USER.bufferMinutes,
        windows,
        overrides,
        busyIntervals: [],
        rangeStart,
        rangeEnd,
      });

      const matching = effective.find(
        (interval) =>
          interval.startUtc.getTime() === expectedRange.startUtc.getTime() &&
          interval.endUtc.getTime() === expectedRange.endUtc.getTime(),
      );

      expect(matching).toBeDefined();
      expect(matching?.startUtc.toISOString()).toBe(
        expectedRange.startUtc.toISOString(),
      );
      expect(matching?.endUtc.toISOString()).toBe(
        expectedRange.endUtc.toISOString(),
      );
    },
  );
});
