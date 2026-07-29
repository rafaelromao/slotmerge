import { describe, expect, inject, it } from "vitest";
import { eq } from "drizzle-orm";

import { createPostgresOperationalStatusRepository } from "../../src/admin/operational-status.repository";
import { createAdminStatusWorkflow } from "../../src/admin/operational-status.workflow";
import { calendarConnections } from "../../src/db/schema";
import {
  CALENDAR_CONNECTION_FIXTURES,
  FIXTURE_DATE,
  seedAll,
} from "../fixtures/seeds";
import { getTestClockObject, getTestDb } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;

describe("seeded admin operational status", () => {
  it.runIf(HAS_TEST_DB)(
    "reports the seeded connected Calendar Connections as healthy",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      const repository = createPostgresOperationalStatusRepository(db);
      const summary = await repository.summarizeCalendarConnections({
        now: new Date(FIXTURE_DATE),
      });

      expect(summary.counts.connected).toBe(
        CALENDAR_CONNECTION_FIXTURES.length,
      );
      expect(summary.tokensNeedingRefresh).toEqual([]);

      const result = await createAdminStatusWorkflow({
        statusRepository: repository,
        clock: getTestClockObject(),
      }).load();

      expect(result.generatedAt.toISOString()).toBe(FIXTURE_DATE);
      expect(result.tokensCount).toBe(0);
      expect(result.health.tokens).toBe("green");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "restores the healthy token expiry when reseeding an existing connection",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await db
        .update(calendarConnections)
        .set({ accessTokenExpiresAt: null })
        .where(eq(calendarConnections.id, CALENDAR_CONNECTION_FIXTURES[0].id));

      await seedAll(db);

      const summary = await createPostgresOperationalStatusRepository(
        db,
      ).summarizeCalendarConnections({ now: new Date(FIXTURE_DATE) });

      expect(summary.tokensNeedingRefresh).toEqual([]);
    },
  );
});
