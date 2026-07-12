import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("self-delete-account migration", () => {
  it("changes the invites.invited_by_admin_id foreign key to SET NULL and makes the column nullable", async () => {
    const migration = await readFile(
      "drizzle/0005_self_delete_account.sql",
      "utf8",
    );

    expect(migration).toContain(
      'ALTER TABLE "invites" DROP CONSTRAINT "invites_invited_by_admin_id_users_id_fk"',
    );
    expect(migration).toContain(
      'ALTER TABLE "invites" ALTER COLUMN "invited_by_admin_id" DROP NOT NULL',
    );
    expect(migration).toContain(
      'ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_admin_id_users_id_fk" FOREIGN KEY ("invited_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action',
    );
  });

  it("is registered in the migration journal", async () => {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: Array<{ tag: string }> };

    expect(
      journal.entries.some((entry) => entry.tag === "0005_self_delete_account"),
    ).toBe(true);
  });
});
