import { describe, expect, it } from "vitest";

import {
  createEphemeralDatabase,
  closeEphemeralDatabase,
  resetDatabase,
} from "./test-db";
import {
  seedAll,
  USER_FIXTURES,
  TOPIC_FIXTURES,
  AVAILABILITY_WINDOW_FIXTURES,
  OVERRIDE_FIXTURES,
  IMPORTED_BUSY_INTERVAL_FIXTURES,
  CALENDAR_CONNECTION_FIXTURES,
  SESSION_FIXTURES,
  USER_TOPIC_FIXTURES,
} from "../fixtures/seeds";

const HAS_DATABASE = !!process.env.DATABASE_URL;

describe("seeds", () => {
  it.runIf(HAS_DATABASE)("seeds all fixture categories deterministically", async () => {
    const { db } = await createEphemeralDatabase();

    await seedAll(db);

    const usersResult = await db.execute<{ id: string }>(
      `SELECT id FROM users ORDER BY id`,
    );
    expect(usersResult.rows.map((r) => r.id)).toEqual(
      USER_FIXTURES.map((u) => u.id),
    );

    const topicsResult = await db.execute<{ id: string }>(
      `SELECT id FROM topics ORDER BY id`,
    );
    expect(topicsResult.rows.map((r) => r.id)).toEqual(
      TOPIC_FIXTURES.map((t) => t.id),
    );

    const windowsResult = await db.execute<{ id: string }>(
      `SELECT id FROM availability_windows ORDER BY id`,
    );
    expect(windowsResult.rows.map((r) => r.id)).toEqual(
      AVAILABILITY_WINDOW_FIXTURES.map((w) => w.id),
    );

    const overridesResult = await db.execute<{ id: string; type: string }>(
      `SELECT id, type FROM availability_overrides ORDER BY id`,
    );
    expect(overridesResult.rows.map((r) => r.id)).toEqual(
      OVERRIDE_FIXTURES.map((o) => o.id),
    );
    expect(overridesResult.rows.map((r) => r.type)).toEqual(
      OVERRIDE_FIXTURES.map((o) => o.type),
    );

    const connectionsResult = await db.execute<{ id: string }>(
      `SELECT id FROM calendar_connections ORDER BY id`,
    );
    expect(connectionsResult.rows.map((r) => r.id)).toEqual(
      CALENDAR_CONNECTION_FIXTURES.map((c) => c.id),
    );

    const busyResult = await db.execute<{ id: string }>(
      `SELECT id FROM imported_busy_intervals ORDER BY id`,
    );
    expect(busyResult.rows.map((r) => r.id)).toEqual(
      IMPORTED_BUSY_INTERVAL_FIXTURES.map((b) => b.id),
    );

    const userTopicsResult = await db.execute<{ id: string }>(
      `SELECT id FROM user_topics ORDER BY id`,
    );
    expect(userTopicsResult.rows.map((r) => r.id)).toEqual(
      USER_TOPIC_FIXTURES.map((ut) => ut.id),
    );

    const sessionsResult = await db.execute<{ id: string }>(
      `SELECT id FROM sessions ORDER BY id`,
    );
    expect(sessionsResult.rows.map((r) => r.id)).toEqual(
      SESSION_FIXTURES.map((s) => s.id),
    );

    await closeEphemeralDatabase();
  });

  it.runIf(HAS_DATABASE)("resetDatabase clears all tables", async () => {
    const { db } = await createEphemeralDatabase();

    await seedAll(db);

    let usersResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM users`,
    );
    expect(Number(usersResult.rows[0].count)).toBeGreaterThan(0);

    await resetDatabase(db);

    usersResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM users`,
    );
    expect(Number(usersResult.rows[0].count)).toBe(0);

    const overridesResult = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM availability_overrides`,
    );
    expect(Number(overridesResult.rows[0].count)).toBe(0);

    await closeEphemeralDatabase();
  });
});