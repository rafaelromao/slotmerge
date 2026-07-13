import { getTestDb } from "./test-db";
import { resetDatabase } from "./test-db";
import { seedAll } from "../fixtures/seeds";

export async function setupTest(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("Test database not initialized. Did globalSetup run?");
  }
  await resetDatabase(db);
  await seedAll(db);
}
