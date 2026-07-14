import { describe, expect, it } from "vitest";

import {
  createEphemeralDatabase,
  closeEphemeralDatabase,
} from "./test-db";

const HAS_DATABASE = !!process.env.DATABASE_URL;

describe("ephemeral database", () => {
  it.runIf(HAS_DATABASE)(
    "creates a database with migrations applied",
    async () => {
      const { url, db } = await createEphemeralDatabase();

      expect(url).toMatch(/\/slotmerge_test_\d+_\d+$/);

      const result = await db.execute<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );

      const tables = result.rows.map((r) => r.table_name);

      expect(tables).toContain("users");
      expect(tables).toContain("sessions");
      expect(tables).toContain("topics");
      expect(tables).toContain("availability_windows");
      expect(tables).toContain("availability_overrides");
      expect(tables).toContain("imported_busy_intervals");
      expect(tables).toContain("calendar_connections");
      expect(tables).toContain("searches");
      expect(tables).toContain("search_results");
      expect(tables).toContain("email_events");
      expect(tables).toContain("email_event_attempts");

      await closeEphemeralDatabase();
    },
  );

  it.runIf(HAS_DATABASE)("database is empty after creation", async () => {
    const { db } = await createEphemeralDatabase();

    const result = await db.execute<{ count: string }>(
      `SELECT COUNT(*) as count FROM users`,
    );
    expect(Number(result.rows[0].count)).toBe(0);

    await closeEphemeralDatabase();
  });
});