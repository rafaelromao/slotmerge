import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createPostgresInviteRepository } from "../../src/admin/invites.repository";
import {
  invites,
  users,
} from "../../src/db/schema";
import { FIXTURE_DATE, USER_FIXTURES } from "../fixtures/seeds";
import { getTestClock, getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  magicLinkGeneration: number;
  expiresAt: Date;
};

async function readInviteByEmail(
  db: NonNullable<ReturnType<typeof getTestDb>>,
  email: string,
): Promise<InviteRow | null> {
  const result = await db.execute<InviteRow>(
    `SELECT id, email, role, status, magic_link_generation as "magicLinkGeneration", expires_at as "expiresAt" FROM invites WHERE email = '${email.replace(/'/g, "''")}' LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

describe("E2E: Postgres invite repository transactional refreshInvite", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
  });

  it.runIf(HAS_TEST_DB)(
    "refreshInvite updates the existing row in place — preserves id, bumps generation, refreshes expiry",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const inviteId = "00000000-0000-0000-0000-00000000b101";
      const inviteEmail = "refresh-target@example.com";
      const initialExpiry = new Date("2026-07-15T00:00:00.000Z");

      await db.insert(invites).values({
        id: inviteId,
        email: inviteEmail,
        role: "user",
        status: "revoked",
        invitedByAdminId: USER_FIXTURES[2].id,
        magicLinkGeneration: 1,
        expiresAt: initialExpiry,
        createdAt: new Date(FIXTURE_DATE),
        updatedAt: new Date(FIXTURE_DATE),
      });

      const repo = createPostgresInviteRepository(db);
      const now = getTestClock()();
      const freshExpiry = new Date("2026-08-15T00:00:00.000Z");

      const result = await repo.refreshInvite?.({
        inviteId,
        now,
        expiresAt: freshExpiry,
      });
      expect(result?.ok).toBe(true);
      if (!result?.ok) {
        throw new Error("expected ok");
      }
      // Same id (no new row), generation incremented, status reset to pending
      expect(result.invite.id).toBe(inviteId);
      expect(result.invite.status).toBe("pending");
      expect(result.invite.magicLinkGeneration).toBe(2);

      // Verify the persisted row matches — only one row remains
      const row = await readInviteByEmail(db, inviteEmail);
      expect(row).not.toBeNull();
      expect(row?.id).toBe(inviteId);
      expect(row?.status).toBe("pending");
      expect(row?.magicLinkGeneration).toBe(2);
      expect(row?.expiresAt.toISOString()).toBe(freshExpiry.toISOString());
    },
  );

  it.runIf(HAS_TEST_DB)(
    "refreshInvite rejects when the invite email matches an active user",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const inviteId = "00000000-0000-0000-0000-00000000b102";
      // Use a fresh email not already a fixture
      const inviteEmail = "refresh-active-target@example.com";
      const userId = "00000000-0000-0000-0000-00000000b103";

      await db.insert(invites).values({
        id: inviteId,
        email: inviteEmail,
        role: "user",
        status: "revoked",
        invitedByAdminId: USER_FIXTURES[2].id,
        magicLinkGeneration: 0,
        expiresAt: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date(FIXTURE_DATE),
        updatedAt: new Date(FIXTURE_DATE),
      });
      await db.insert(users).values({
        id: userId,
        email: inviteEmail,
        displayName: "Active User",
        role: "user",
        status: "active",
        magicLinkGeneration: 0,
        bufferMinutes: 0,
        createdAt: new Date(FIXTURE_DATE),
        updatedAt: new Date(FIXTURE_DATE),
      });
      // Trick the FK by attaching to a real user; sessions should not exist
      // (FK requires a parent in users which we already inserted)
      // - We can ignore sessions since refreshInvite does not touch them.

      const repo = createPostgresInviteRepository(db);
      const now = getTestClock()();
      const freshExpiry = new Date("2026-08-15T00:00:00.000Z");

      const result = await repo.refreshInvite?.({
        inviteId,
        now,
        expiresAt: freshExpiry,
      });
      expect(result).toEqual({ ok: false, reason: "user_already_active" });

      // The invite remains untouched
      const row = await readInviteByEmail(db, inviteEmail);
      expect(row?.id).toBe(inviteId);
      expect(row?.status).toBe("revoked");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "refreshInvite returns not_found for a missing invite id",
    async () => {
      await setupTest();
      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const repo = createPostgresInviteRepository(db);
      const result = await repo.refreshInvite?.({
        inviteId: "00000000-0000-0000-0000-000000000000",
        now: getTestClock()(),
        expiresAt: new Date("2026-08-15T00:00:00.000Z"),
      });
      expect(result).toEqual({ ok: false, reason: "not_found" });
    },
  );
});
