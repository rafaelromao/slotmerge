import { describe, expect, inject, it } from "vitest";

import { getTestClock, getTestDb, setupTest } from "../helpers/setup";
import { FIXTURE_DATE, USER_FIXTURES } from "../fixtures/seeds";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

describe("E2E infrastructure smoke test", () => {
  it.runIf(HAS_TEST_DB)(
    "globalSetup + setupFiles wire the test DB through vitest workers",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }
      await setupTest();

      const result = await db.execute<{ count: string }>(
        "SELECT COUNT(*) as count FROM users",
      );
      expect(Number(result.rows[0].count)).toBe(USER_FIXTURES.length);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "setupTest resets the DB and reseeds deterministically",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }
      await setupTest();

      await db.execute(
        "INSERT INTO users (id, email) VALUES (gen_random_uuid(), 'ghost@example.com')",
      );
      const before = await db.execute<{ count: string }>(
        "SELECT COUNT(*) as count FROM users",
      );
      expect(Number(before.rows[0].count)).toBe(USER_FIXTURES.length + 1);

      await setupTest();

      const after = await db.execute<{ count: string }>(
        "SELECT COUNT(*) as count FROM users",
      );
      expect(Number(after.rows[0].count)).toBe(USER_FIXTURES.length);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "getTestClock returns the fixture date after setupTest",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }
      await setupTest();
      const now = getTestClock()();
      expect(now.toISOString()).toBe(FIXTURE_DATE);
    },
  );
});