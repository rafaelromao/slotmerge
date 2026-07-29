import { describe, expect, inject, it } from "vitest";

import { computeEffectiveAvailability } from "../../src/matching/effective-availability";
import { createPostgresWeeklyAvailabilityWindowRepository } from "../../src/profile/availability-windows";
import { USER_FIXTURES } from "../fixtures/seeds";
import { getTestClockObject, getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const FIXTURE_USER = USER_FIXTURES[0];
const PROFILE_TIMEZONE = "America/Sao_Paulo";
const MONDAY_DAY_OF_WEEK = 1;
const WINDOW_START = "09:00";
const WINDOW_END = "12:00";
const RANGE_START = new Date("2026-02-23T00:00:00.000Z");
const RANGE_END = new Date("2026-11-09T23:59:59.999Z");
const US_SPRING_FORWARD_INSTANT = new Date("2026-03-08T05:00:00.000Z");
const US_FALL_BACK_INSTANT = new Date("2026-11-01T05:00:00.000Z");
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

async function setUserToSaoPaulo(): Promise<void> {
  const db = getTestDb();
  expect(db).not.toBeNull();
  if (!db) {
    return;
  }

  await db.execute(
    `UPDATE users SET profile_timezone = '${PROFILE_TIMEZONE}' WHERE id = '${FIXTURE_USER.id}'`,
  );
  await db.execute(
    `DELETE FROM availability_windows WHERE user_id = '${FIXTURE_USER.id}'`,
  );
}

describe("E2E: define weekly Availability Windows in profile timezone", () => {
  it.runIf(HAS_TEST_DB)(
    "addWeeklyAvailabilityWindow persists a Mon 09:00-12:00 weekly window with profile_timezone = America/Sao_Paulo",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      const repository =
        createPostgresWeeklyAvailabilityWindowRepository(getTestClockObject());
      const seeded = await repository.listByUserId(FIXTURE_USER.id);
      expect(seeded).toHaveLength(2);
      await setUserToSaoPaulo();

      const window = await repository.add(
        FIXTURE_USER.id,
        {
          dayOfWeek: MONDAY_DAY_OF_WEEK,
          startTime: WINDOW_START,
          endTime: WINDOW_END,
        },
        PROFILE_TIMEZONE,
      );

      expect(window.id).toBeTruthy();
      expect(window.dayOfWeek).toBe(MONDAY_DAY_OF_WEEK);
      expect(window.startTime).toBe(WINDOW_START);
      expect(window.endTime).toBe(WINDOW_END);
      expect(window.profileTimezone).toBe(PROFILE_TIMEZONE);

      const persisted = await db.execute<{
        day_of_week: number;
        start_time: string;
        end_time: string;
        profile_timezone: string;
      }>(
        `SELECT day_of_week, start_time, end_time, profile_timezone
         FROM availability_windows
         WHERE user_id = '${FIXTURE_USER.id}'`,
      );

      expect(persisted.rows).toHaveLength(1);
      const row = persisted.rows[0];
      expect(row.day_of_week).toBe(MONDAY_DAY_OF_WEEK);
      expect(row.start_time).toBe(WINDOW_START);
      expect(row.end_time).toBe(WINDOW_END);
      expect(row.profile_timezone).toBe(PROFILE_TIMEZONE);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "computeEffectiveAvailability sees the persisted window and applies it consistently across DST transitions",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await setUserToSaoPaulo();
      const repository =
        createPostgresWeeklyAvailabilityWindowRepository(getTestClockObject());

      await repository.add(
        FIXTURE_USER.id,
        {
          dayOfWeek: MONDAY_DAY_OF_WEEK,
          startTime: WINDOW_START,
          endTime: WINDOW_END,
        },
        PROFILE_TIMEZONE,
      );

      const windows = await repository.listByUserId(FIXTURE_USER.id);
      expect(windows).toHaveLength(1);
      expect(windows[0].profileTimezone).toBe(PROFILE_TIMEZONE);
      expect(windows[0].dayOfWeek).toBe(MONDAY_DAY_OF_WEEK);

      const effective = computeEffectiveAvailability({
        userId: FIXTURE_USER.id,
        profileTimezone: PROFILE_TIMEZONE,
        bufferMinutes: FIXTURE_USER.bufferMinutes,
        windows,
        overrides: [],
        busyIntervals: [],
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
      });

      expect(effective.length).toBeGreaterThan(0);

      for (const interval of effective) {
        const durationMs =
          interval.endUtc.getTime() - interval.startUtc.getTime();
        expect(durationMs).toBe(THREE_HOURS_MS);
        expect(interval.startUtc.getUTCHours()).toBe(12);
        expect(interval.startUtc.getUTCMinutes()).toBe(0);
        expect(interval.endUtc.getUTCHours()).toBe(15);
        expect(interval.endUtc.getUTCMinutes()).toBe(0);
      }

      const mondaysBeforeDst = effective.filter(
        (interval) =>
          interval.startUtc.getTime() < US_SPRING_FORWARD_INSTANT.getTime(),
      );
      const mondaysAfterDst = effective.filter(
        (interval) =>
          interval.startUtc.getTime() >= US_FALL_BACK_INSTANT.getTime(),
      );

      expect(mondaysBeforeDst.length).toBeGreaterThan(0);
      expect(mondaysAfterDst.length).toBeGreaterThan(0);

      for (const interval of [...mondaysBeforeDst, ...mondaysAfterDst]) {
        const durationMs =
          interval.endUtc.getTime() - interval.startUtc.getTime();
        expect(durationMs).toBe(THREE_HOURS_MS);
        expect(interval.startUtc.getUTCHours()).toBe(12);
        expect(interval.endUtc.getUTCHours()).toBe(15);
      }
    },
  );

  it.runIf(HAS_TEST_DB)(
    "finds, updates, and removes seeded windows with user ownership and the injected Clock",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      const clock = getTestClockObject();
      const repository =
        createPostgresWeeklyAvailabilityWindowRepository(clock);
      const seeded = await repository.listByUserId(FIXTURE_USER.id);
      const existing = seeded[0];
      expect(existing).toBeDefined();
      if (!existing) {
        return;
      }

      expect(await repository.findById(existing.id, FIXTURE_USER.id)).toEqual(
        existing,
      );
      expect(await repository.findById(existing.id, USER_FIXTURES[1].id)).toBe(
        null,
      );

      const updated = await repository.updateById(
        existing.id,
        FIXTURE_USER.id,
        {
          startTime: "10:00",
        },
      );
      expect(updated?.startTime).toBe("10:00");
      expect(updated?.updatedAt).toEqual(clock.now());
      expect(
        await repository.updateById(existing.id, USER_FIXTURES[1].id, {
          startTime: "11:00",
        }),
      ).toBeNull();

      expect(
        await repository.removeById(existing.id, USER_FIXTURES[1].id),
      ).toBe(false);
      expect(await repository.removeById(existing.id, FIXTURE_USER.id)).toBe(
        true,
      );
      expect(
        await repository.findById(existing.id, FIXTURE_USER.id),
      ).toBeNull();
    },
  );
});
