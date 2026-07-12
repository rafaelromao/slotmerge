import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("discoverability consent migration", () => {
  it("creates a one-row-per-user consent table with a cascade FK to users", async () => {
    const sql = await readFile(
      "drizzle/0004_discoverability_consent.sql",
      "utf8",
    );

    expect(sql).toContain('CREATE TABLE "discoverability_consents"');
    expect(sql).toContain('"user_id" uuid PRIMARY KEY NOT NULL');
    expect(sql).toContain(
      'CONSTRAINT "discoverability_consents_user_id_users_id_fk"',
    );
    expect(sql).toContain("ON DELETE cascade");
    expect(sql).toContain('"granted_at" timestamp with time zone');
  });

  it("registers the migration in the drizzle journal so drizzle-kit can apply it in order", async () => {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: Array<{ tag: string }> };

    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags).toContain("0004_discoverability_consent");
  });
});
