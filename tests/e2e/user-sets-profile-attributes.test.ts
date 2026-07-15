import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";

import { GET, PATCH } from "../../app/me/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { sessions, users } from "../../src/db/schema";
import { SESSION_FIXTURES, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const ALICE = USER_FIXTURES[0];
const ALICE_SESSION = SESSION_FIXTURES[0];

const NO_DISPLAY_NAME_USER_ID = "00000000-0000-0000-0000-000000007501";
const NO_DISPLAY_NAME_USER_EMAIL = "no-display-name@example.com";
const NO_DISPLAY_NAME_SESSION_ID = "00000000-0000-0000-0000-000000007502";
const NO_DISPLAY_NAME_CSRF_TOKEN = "csrf-no-display-name-75";

type UserRow = {
  display_name: string | null;
  avatar_url: string | null;
  short_bio: string | null;
  profile_timezone: string | null;
  buffer_minutes: number;
};

async function readUserRow(userId: string): Promise<UserRow> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<UserRow>(
    `SELECT display_name, avatar_url, short_bio, profile_timezone, buffer_minutes
     FROM users WHERE id = '${userId}'`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`user ${userId} not found`);
  }
  return row;
}

async function insertUserWithoutDisplayName(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date("2026-07-12T12:00:00.000Z");
  await db.insert(users).values({
    id: NO_DISPLAY_NAME_USER_ID,
    email: NO_DISPLAY_NAME_USER_EMAIL,
    displayName: null,
    role: "user",
    status: "active",
    profileTimezone: null,
    bufferMinutes: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(sessions).values({
    id: NO_DISPLAY_NAME_SESSION_ID,
    userId: NO_DISPLAY_NAME_USER_ID,
    csrfToken: NO_DISPLAY_NAME_CSRF_TOKEN,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    createdAt: now,
  });
}

async function patchAs(
  sessionId: string,
  csrfToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId });
  return PATCH(
    new Request("http://localhost/me", {
      method: "PATCH",
      headers: {
        cookie,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

async function getAs(sessionId: string): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId });
  return GET(
    new Request("http://localhost/me", {
      headers: { cookie },
    }),
  );
}

describe("E2E: user sets profile attributes", () => {
  beforeEach(() => {
    setSessionRepositoryForTests(null);
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
  });

  it.runIf(HAS_TEST_DB)(
    "rejects PATCH /me when the authenticated User has no display name and the update does not supply one",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertUserWithoutDisplayName();

      const response = await patchAs(
        NO_DISPLAY_NAME_SESSION_ID,
        NO_DISPLAY_NAME_CSRF_TOKEN,
        {
          shortBio: "should not be saved",
        },
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "profile_not_found",
      });

      const row = await readUserRow(NO_DISPLAY_NAME_USER_ID);
      expect(row.display_name).toBeNull();
      expect(row.short_bio).toBeNull();
    },
  );

  it.runIf(HAS_TEST_DB)(
    "persists a new display name supplied via PATCH /me to the users table and reflects it on the next GET /me",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const response = await patchAs(ALICE_SESSION.id, ALICE_SESSION.csrfToken, {
        displayName: "Alice Q. User",
      });

      expect(response.status).toBe(200);

      const row = await readUserRow(ALICE.id);
      expect(row.display_name).toBe("Alice Q. User");

      const followUp = await getAs(ALICE_SESSION.id);
      expect(followUp.status).toBe(200);
      const body = (await followUp.json()) as {
        user: { displayName: string | null };
      };
      expect(body.user.displayName).toBe("Alice Q. User");
    },
  );

  it.runIf(HAS_TEST_DB)(
    "persists avatar, bio, timezone, and buffer supplied via PATCH /me to the users table",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const response = await patchAs(ALICE_SESSION.id, ALICE_SESSION.csrfToken, {
        avatarUrl: "https://example.com/alice.png",
        shortBio: "Distributed systems engineer",
        profileTimezone: "Europe/London",
        bufferMinutes: 45,
      });

      expect(response.status).toBe(200);

      const row = await readUserRow(ALICE.id);
      expect(row.avatar_url).toBe("https://example.com/alice.png");
      expect(row.short_bio).toBe("Distributed systems engineer");
      expect(row.profile_timezone).toBe("Europe/London");
      expect(row.buffer_minutes).toBe(45);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "rejects PATCH /me with an empty display name without mutating the users table",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const response = await patchAs(ALICE_SESSION.id, ALICE_SESSION.csrfToken, {
        displayName: "   ",
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_profile_update",
      });

      const row = await readUserRow(ALICE.id);
      expect(row.display_name).toBe(ALICE.displayName);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "round-trips every editable profile attribute through PATCH /me and the next GET /me",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();

      const updated = {
        displayName: "Alice R. User",
        avatarUrl: "https://example.com/alice-v2.png",
        shortBio: "Staff engineer focused on calendars",
        profileTimezone: "America/Los_Angeles",
        bufferMinutes: 30,
      };

      const patchResponse = await patchAs(
        ALICE_SESSION.id,
        ALICE_SESSION.csrfToken,
        updated,
      );
      expect(patchResponse.status).toBe(200);

      const getResponse = await getAs(ALICE_SESSION.id);
      expect(getResponse.status).toBe(200);
      const body = (await getResponse.json()) as {
        user: {
          displayName: string | null;
          avatarUrl: string | null;
          shortBio: string | null;
          profileTimezone: string | null;
          bufferMinutes: number;
        };
      };

      expect(body.user).toEqual({
        id: ALICE.id,
        email: ALICE.email,
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl,
        shortBio: updated.shortBio,
        role: ALICE.role,
        status: ALICE.status,
        profileTimezone: updated.profileTimezone,
        bufferMinutes: updated.bufferMinutes,
      });
    },
  );
});