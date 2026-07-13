import { describe, expect, it } from "vitest";

import {
  createEphemeralDatabase,
  closeEphemeralDatabase,
  resetDatabase,
} from "./test-db";
import { seedAll, USER_FIXTURES, TOPIC_FIXTURES } from "../fixtures/seeds";

const HAS_DATABASE = !!process.env.DATABASE_URL;

describe("seeds", () => {
  it.runIf(HAS_DATABASE)("seeds all fixtures", async () => {
    const { db } = await createEphemeralDatabase();

    await seedAll(db);

    const usersResult = await db.execute(`SELECT id FROM users ORDER BY id`);
    const users = (usersResult as unknown as { rows: { id: string }[] }).rows;
    expect(users).toHaveLength(USER_FIXTURES.length);

    const topicsResult = await db.execute(`SELECT id FROM topics ORDER BY id`);
    const topics = (topicsResult as unknown as { rows: { id: string }[] }).rows;
    expect(topics).toHaveLength(TOPIC_FIXTURES.length);

    const windowsResult = await db.execute(
      `SELECT COUNT(*) as count FROM availability_windows`,
    );
    const windowsRows = windowsResult as unknown as { rows: { count: string }[] };
    const windowsCount = Number(windowsRows.rows[0].count);
    expect(windowsCount).toBeGreaterThan(0);

    await closeEphemeralDatabase();
  });

  it.runIf(HAS_DATABASE)("resetDatabase clears all tables", async () => {
    const { db } = await createEphemeralDatabase();

    await seedAll(db);

    let usersResult = await db.execute(`SELECT COUNT(*) as count FROM users`);
    let rows = usersResult as unknown as { rows: { count: string }[] };
    let count = Number(rows.rows[0].count);
    expect(count).toBeGreaterThan(0);

    await resetDatabase(db);

    usersResult = await db.execute(`SELECT COUNT(*) as count FROM users`);
    rows = usersResult as unknown as { rows: { count: string }[] };
    count = Number(rows.rows[0].count);
    expect(count).toBe(0);

    await closeEphemeralDatabase();
  });
});
