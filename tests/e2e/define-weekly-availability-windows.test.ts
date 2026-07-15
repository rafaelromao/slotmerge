import { describe, expect, inject, it } from "vitest";

import { POST } from "../../app/me/availability-windows/route";
import { sealSessionCookie } from "../../src/auth/session";
import { computeEffectiveAvailability } from "../../src/matching/effective-availability";
import { listWeeklyAvailabilityWindowsByUserId } from "../../src/profile/availability-windows";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const FIXTURE_USER = USER_FIXTURES[0];
const FIXTURE_SESSION = SESSION_FIXTURES[0];
const PROFILE_TIMEZONE = "America/Sao_Paulo";
const MONDAY_DAY_OF_WEEK = 1;
const WINDOW_START = "09:00";
const WINDOW_END = "12:00";
const RANGE_START = new Date("2026-02-23T00:00:00.000Z");
const RANGE_END = new Date("2026-11-09T23:59:59.999Z");

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

async function postWindow(): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: FIXTURE_SESSION.id });
  return POST(
    new Request("http://localhost/me/availability-windows", {
      method: "POST",
      headers: {
        cookie,
        "x-csrf-token": FIXTURE_SESSION.csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dayOfWeek: MONDAY_DAY_OF_WEEK,
        startTime: WINDOW_START,
        endTime: WINDOW_END,
      }),
    }),
  );
}

describe("E2E: define weekly Availability Windows in profile timezone", () => {
  it.runIf(HAS_TEST_DB)(
    "POST /me/availability-windows persists a Mon 09:00-12:00 weekly window with profile_timezone = America/Sao_Paulo",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await setUserToSaoPaulo();

      const response = await postWindow();

      expect(response.status).toBe(201);

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

      const response = await postWindow();
      expect(response.status).toBe(201);

      const windows = await listWeeklyAvailabilityWindowsByUserId(
        FIXTURE_USER.id,
      );
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

      const threeHoursMs = 3 * 60 * 60 * 1000;
      for (const interval of effective) {
        const durationMs =
          interval.endUtc.getTime() - interval.startUtc.getTime();
        expect(durationMs).toBe(threeHoursMs);
        expect(interval.startUtc.getUTCHours()).toBe(12);
        expect(interval.startUtc.getUTCMinutes()).toBe(0);
        expect(interval.endUtc.getUTCHours()).toBe(15);
        expect(interval.endUtc.getUTCMinutes()).toBe(0);
      }

      const mondaysBeforeDst = effective.filter(
        (interval) =>
          interval.startUtc.getTime() <
          new Date("2026-03-08T05:00:00.000Z").getTime(),
      );
      const mondaysAfterDst = effective.filter(
        (interval) =>
          interval.startUtc.getTime() >=
          new Date("2026-11-01T05:00:00.000Z").getTime(),
      );

      expect(mondaysBeforeDst.length).toBeGreaterThan(0);
      expect(mondaysAfterDst.length).toBeGreaterThan(0);

      for (const interval of [...mondaysBeforeDst, ...mondaysAfterDst]) {
        expect(interval.startUtc.getUTCHours()).toBe(12);
        expect(interval.endUtc.getUTCHours()).toBe(15);
        const durationMs =
          interval.endUtc.getTime() - interval.startUtc.getTime();
        expect(durationMs).toBe(threeHoursMs);
      }
    },
  );
});
