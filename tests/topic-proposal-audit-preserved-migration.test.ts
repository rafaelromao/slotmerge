import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("topic-proposal audit-preserved migration", () => {
  it("changes the topic_proposals.proposed_by_user_id foreign key to SET NULL and makes the column nullable", async () => {
    const migration = await readFile(
      "drizzle/0012_topic_proposal_audit_preserved.sql",
      "utf8",
    );

    expect(migration).toContain(
      'ALTER TABLE "topic_proposals" DROP CONSTRAINT "topic_proposals_proposed_by_user_id_users_id_fk"',
    );
    expect(migration).toContain(
      'ALTER TABLE "topic_proposals" ALTER COLUMN "proposed_by_user_id" DROP NOT NULL',
    );
    expect(migration).toContain(
      'ALTER TABLE "topic_proposals" ADD CONSTRAINT "topic_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action',
    );
  });

  it("is registered in the migration journal", async () => {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    ) as { entries: Array<{ tag: string }> };

    expect(
      journal.entries.some(
        (entry) => entry.tag === "0012_topic_proposal_audit_preserved",
      ),
    ).toBe(true);
  });

  it("declares topicProposals.proposedByUserId as nullable in the schema", async () => {
    const schema = await readFile("src/db/schema.ts", "utf8");

    expect(schema).toContain(
      'export const topicProposals = pgTable("topic_proposals"',
    );
    expect(schema).toContain(
      'proposedByUserId: uuid("proposed_by_user_id").references(() => users.id, {',
    );
    expect(schema).toContain('onDelete: "set null"');
  });
});
