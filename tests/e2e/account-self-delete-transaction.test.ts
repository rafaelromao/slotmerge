import { eq } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { createPostgresAccountRepository } from "../../src/account/repository";
import { emailEvents, users } from "../../src/db/schema";
import { getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;
const USER_ID = "00000000-0000-0000-0000-00000000c295";
const EMAIL_EVENT_ID = "00000000-0000-0000-0000-00000000e295";

describe("E2E: account self-delete transaction", () => {
  it.runIf(HAS_TEST_DB)(
    "rolls back personal Email event deletion when User deletion fails",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const now = new Date("2026-07-12T12:00:00.000Z");
      await db.insert(users).values({
        id: USER_ID,
        email: "rollback-self-delete@example.com",
        displayName: "Rollback User",
        role: "user",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(emailEvents).values({
        id: EMAIL_EVENT_ID,
        recipient: "rollback-self-delete@example.com",
        type: "magic-link",
        payloadReference: "rollback-reference",
        status: "sent",
        createdAt: now,
        updatedAt: now,
      });

      await db.execute(`
        CREATE FUNCTION fail_self_delete_295() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'forced self-delete failure';
        END;
        $$ LANGUAGE plpgsql;
      `);
      await db.execute(`
        CREATE TRIGGER fail_self_delete_295_trigger
        BEFORE DELETE ON users
        FOR EACH ROW
        WHEN (OLD.id = '${USER_ID}'::uuid)
        EXECUTE FUNCTION fail_self_delete_295();
      `);

      try {
        const repository = createPostgresAccountRepository(db);
        await expect(repository.selfDelete(USER_ID)).rejects.toThrow();
      } finally {
        await db.execute(
          `DROP TRIGGER IF EXISTS fail_self_delete_295_trigger ON users`,
        );
        await db.execute(`DROP FUNCTION IF EXISTS fail_self_delete_295()`);
      }

      const remainingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, USER_ID));
      const remainingEmailEvent = await db
        .select({ id: emailEvents.id })
        .from(emailEvents)
        .where(eq(emailEvents.id, EMAIL_EVENT_ID));

      expect(remainingUser).toHaveLength(1);
      expect(remainingEmailEvent).toHaveLength(1);
    },
  );
});
