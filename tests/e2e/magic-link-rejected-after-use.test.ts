import { systemDependencies } from "../../src/system";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createMagicLinkVerifyHandlers } from "../../src/auth/magic-link-verify";
import { createMagicLinkTokenIssuer } from "../../src/auth/magic-link";
import { invites, users } from "../../src/db/schema";
import { eq } from "drizzle-orm";

import { getTestDb, setupTest } from "../helpers/setup";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const INVITE_ID = "00000000-0000-0000-0000-000000000072";
const INVITEE_EMAIL = "link-replay@example.com";

async function seedPendingInvite(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date();
  await db.insert(invites).values({
    id: INVITE_ID,
    email: INVITEE_EMAIL,
    role: "user",
    status: "pending",
    magicLinkGeneration: 0,
    invitedByAdminId: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
  });
}

async function countSessionsForUserEmail(email: string): Promise<number> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    return 0;
  }
  const result = await db.execute<{ count: string }>(
    `SELECT COUNT(*) as count FROM sessions WHERE user_id = '${user.id.replace(/'/g, "''")}'`,
  );
  return Number(result.rows[0].count);
}

async function readInviteStatus(): Promise<string | null> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const [row] = await db
    .select({ status: invites.status })
    .from(invites)
    .where(eq(invites.id, INVITE_ID))
    .limit(1);
  return row?.status ?? null;
}

describe("E2E: magic link is rejected after use", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = "test-magic-link-secret-72";
    process.env.SESSION_SECRET = "test-session-secret-72-characters-long";
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  it.runIf(HAS_TEST_DB)(
    "first click creates a session; second click is rejected with a used-link error and creates no second session",
    async () => {
      await setupTest();
      await seedPendingInvite();

      const issuer = createMagicLinkTokenIssuer({
        clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
        baseUrl: "https://slotmerge.example.com",
        secret: process.env.MAGIC_LINK_SECRET ?? "",
      });
      const token = issuer.issueMagicLinkToken({
        inviteId: INVITE_ID,
        email: INVITEE_EMAIL,
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      });

      const { POST } = createMagicLinkVerifyHandlers({
        ...systemDependencies(),
        magicLinkSecret: process.env.MAGIC_LINK_SECRET,
      });

      const firstResponse = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: token.token }).toString(),
        }),
      );

      expect(firstResponse.status).toBe(303);
      expect(firstResponse.headers.get("Location")).toBe("http://localhost/");
      expect(firstResponse.headers.get("Set-Cookie")).toContain(
        "slotmerge_session=",
      );

      expect(await readInviteStatus()).toBe("accepted");
      expect(await countSessionsForUserEmail(INVITEE_EMAIL)).toBe(1);

      const secondResponse = await POST(
        new Request("http://localhost/auth/magic-link/verify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: token.token }).toString(),
        }),
      );

      expect(secondResponse.status).toBe(303);
      const secondUrl = new URL(secondResponse.headers.get("Location")!);
      expect(secondUrl.searchParams.get("error")).toBe("link_used");
      expect(secondUrl.searchParams.get("reason")).toBe(
        "invite_already_accepted",
      );

      expect(await countSessionsForUserEmail(INVITEE_EMAIL)).toBe(1);
    },
  );
});
