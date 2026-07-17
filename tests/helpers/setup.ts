import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../src/db/schema";
import { resetDatabase } from "./test-db";
import { seedAll, FIXTURE_DATE } from "../fixtures/seeds";
import { fixedClock } from "../fixtures/clock";

type TestDb = ReturnType<typeof drizzle>;

let pool: Pool | null = null;
let db: TestDb | null = null;
let currentClock: (() => Date) | null = null;

beforeAll(() => {
  const url = inject("testDbUrl") as string | undefined;
  if (!url) {
    return;
  }
  process.env.DATABASE_URL = url;
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
});

afterAll(async () => {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
});

export function getTestDb(): TestDb | null {
  return db;
}

export function getTestClock(): () => Date {
  if (!currentClock) {
    currentClock = fixedClock(FIXTURE_DATE);
  }
  return currentClock;
}

export function getTestClockObject(): { now(): Date } {
  return { now: getTestClock() };
}

export async function setupTest(): Promise<void> {
  if (!db) {
    return;
  }
  await resetDatabase(db);
  await seedAll(db);
  currentClock = fixedClock(FIXTURE_DATE);
}

beforeEach(async () => {
  await setupTest();
});
