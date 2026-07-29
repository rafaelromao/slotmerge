import { eq } from "drizzle-orm";

import type { AppDb } from "../../../src/db/client";
import { topics } from "../../../src/db/schema";
import { seedAll } from "../../fixtures/seeds";

const APPROVE_PROPOSAL_NAME = "Engineering management";

export async function resetAdminFixtures(db: AppDb): Promise<void> {
  await seedAll(db);
  await db.delete(topics).where(eq(topics.name, APPROVE_PROPOSAL_NAME));
}
