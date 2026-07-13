import { exec } from "node:child_process";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../src/db/schema";

const execAsync = promisify(exec);

let globalPool: Pool | null = null;
let globalTestPool: Pool | null = null;
let globalTestDb: ReturnType<typeof drizzle> | null = null;

function getSystemPool(): Pool {
  if (!globalPool) {
    const baseUrl =
      process.env.DATABASE_URL ?? "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";
    const match = baseUrl.match(/^(postgres:\/\/[^:]+:[^@]+@[^:]+:\d+)\//);
    if (!match) {
      throw new Error(
        "Cannot derive system DATABASE_URL from DATABASE_URL. Expected format: postgres://user:pass@host:port/dbname",
      );
    }
    globalPool = new Pool({ connectionString: match[1] + "/postgres" });
  }
  return globalPool;
}

async function createDatabase(dbName: string): Promise<void> {
  const pool = getSystemPool();
  try {
    await pool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await pool.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await pool.end();
    globalPool = null;
  }
}

async function runMigrations(url: string): Promise<void> {
  const { stderr } = await execAsync(
    `DATABASE_URL="${url}" pnpm drizzle-kit push --force`,
    { cwd: process.cwd() },
  );
  if (stderr) {
    console.error("drizzle-kit push stderr:", stderr);
  }
}

export async function createEphemeralDatabase(): Promise<{
  url: string;
  db: ReturnType<typeof drizzle>;
}> {
  const dbName = `slotmerge_test_${process.pid}_${Date.now()}`;
  await createDatabase(dbName);

  const url = `postgres://slotmerge:slotmerge@localhost:5432/${dbName}`;

  await runMigrations(url);

  const pool = new Pool({ connectionString: url });
  globalTestPool = pool;
  globalTestDb = drizzle(pool, { schema });

  return { url, db: globalTestDb };
}

export async function resetDatabase(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  const tables = [
    "email_event_attempts",
    "email_events",
    "discoverability_consents",
    "imported_busy_intervals",
    "calendar_connections",
    "user_topics",
    "availability_windows",
    "topic_proposals",
    "searches",
    "sessions",
    "invites",
    "topics",
    "users",
    "local_smoke_jobs",
  ];

  for (const table of tables) {
    await db.execute(
      `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`,
    );
  }
}

export async function closeEphemeralDatabase(): Promise<void> {
  if (globalTestPool) {
    await globalTestPool.end();
    globalTestPool = null;
    globalTestDb = null;
  }
  if (globalPool) {
    await globalPool.end();
    globalPool = null;
  }
}

export function getTestDb(): ReturnType<typeof drizzle> | null {
  return globalTestDb;
}

export function getTestDbUrl(): string | null {
  if (!globalTestPool) return null;
  return (globalTestPool as { connectionString?: string }).connectionString ?? null;
}
