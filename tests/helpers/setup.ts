import { getTestDb, resetDatabase } from "./test-db";
import { seedAll } from "../fixtures/seeds";
import { fixedClock } from "../fixtures/clock";

const FIXTURE_DATE = "2026-07-12T12:00:00.000Z";

let currentClock: (() => Date) | null = null;

export function getTestClock(): () => Date {
  if (!currentClock) {
    currentClock = fixedClock(FIXTURE_DATE);
  }
  return currentClock;
}

export async function setupTest(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("Test database not initialized. Did globalSetup run?");
  }
  await resetDatabase(db);
  await seedAll(db);
  currentClock = fixedClock(FIXTURE_DATE);
}
