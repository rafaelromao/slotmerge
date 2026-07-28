import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("audit_records migration", () => {
  it("creates the audit_records table with the non-personal shape (no FKs on actor/target)", async () => {
    const migration = await readFile("drizzle/0016_audit_records.sql", "utf8");

    expect(migration).toContain('CREATE TABLE "audit_records"');
    expect(migration).toContain('"actor_id" uuid NOT NULL');
    expect(migration).toContain('"action" text NOT NULL');
    expect(migration).toContain('"target_type" text NOT NULL');
    expect(migration).toContain('"target_id" uuid NOT NULL');
    expect(migration).toContain('"metadata" jsonb');
    expect(migration).toContain('"created_at" timestamp with time zone');

    expect(migration).not.toContain('REFERENCES "public"."users"("id")');
  });

  it("is registered in the migration journal", async () => {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: Array<{ tag: string }> };

    expect(
      journal.entries.some((entry) => entry.tag === "0016_audit_records"),
    ).toBe(true);
  });

  it("declares the audit_records schema with non-FK actor/target columns and jsonb metadata", async () => {
    const schema = await readFile("src/db/schema.ts", "utf8");

    expect(schema).toContain('export const auditRecords = pgTable(\n  "audit_records"');
    expect(schema).toContain('actorId: uuid("actor_id").notNull()');
    expect(schema).toContain('targetId: uuid("target_id").notNull()');
    expect(schema).toContain('metadata: jsonb("metadata")');
    expect(schema).toContain("$type<Record<string, unknown>>()");
    expect(schema).toContain(
      'index("audit_records_actor_id_idx").on(table.actorId)',
    );
    expect(schema).toContain(
      'index("audit_records_target_id_idx").on(table.targetId)',
    );
    expect(schema).toContain(
      'index("audit_records_action_idx").on(table.action)',
    );
  });
});
