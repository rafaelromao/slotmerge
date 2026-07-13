import { describe, expect, it } from "vitest";

import {
  createEphemeralDatabase,
  closeEphemeralDatabase,
} from "./test-db";

describe("ephemeral database", () => {
  it("creates a database with migrations applied", async () => {
    const { url, db } = await createEphemeralDatabase();

    expect(url).toMatch(/^postgres:\/\/slotmerge:slotmerge@localhost:5432\/slotmerge_test_\d+_\d+$/);

    const result = await db.execute(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );

    const rows = (result as unknown as { rows: { table_name: string }[] }).rows;
    const tables = rows.map((r) => r.table_name);

    expect(tables).toContain("users");
    expect(tables).toContain("sessions");
    expect(tables).toContain("topics");
    expect(tables).toContain("availability_windows");
    expect(tables).toContain("imported_busy_intervals");
    expect(tables).toContain("calendar_connections");
    expect(tables).toContain("searches");
    expect(tables).toContain("email_events");

    await closeEphemeralDatabase();
  });

  it("database is empty after creation", async () => {
    const { db } = await createEphemeralDatabase();

    const result = await db.execute(`SELECT COUNT(*) as count FROM users`);
    const rows = result as unknown as { rows: { count: string }[] };
    const count = rows.rows[0].count;
    expect(Number(count)).toBe(0);

    await closeEphemeralDatabase();
  });
});
