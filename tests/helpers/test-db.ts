import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../src/db/schema";

let globalTestPool: Pool | null = null;
let globalTestDb: ReturnType<typeof drizzle> | null = null;

async function createDatabase(dbName: string): Promise<void> {
  const baseUrl =
    process.env.DATABASE_URL ?? "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";
  const match = baseUrl.match(/^(postgres:\/\/[^:]+:[^@]+@[^:]+:\d+)\//);
  if (!match) {
    throw new Error(
      "Cannot derive system DATABASE_URL from DATABASE_URL. Expected format: postgres://user:pass@host:port/dbname",
    );
  }
  const pool = new Pool({ connectionString: match[1] + "/postgres" });
  try {
    await pool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await pool.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(dbName: string): Promise<void> {
  const baseUrl =
    process.env.DATABASE_URL ?? "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";
  const match = baseUrl.match(/^(postgres:\/\/[^:]+:[^@]+@[^:]+:\d+)\//);
  if (!match) {
    return;
  }
  const pool = new Pool({ connectionString: match[1] + "/postgres" });
  try {
    await pool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  } catch {
    // ignore cleanup errors
  } finally {
    await pool.end();
  }
}

async function runMigrations(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url });
  try {
    const drizzleDir = join(process.cwd(), "drizzle");
    const files = (await readdir(drizzleDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const sql = await readFile(join(drizzleDir, file), "utf-8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

export async function createEphemeralDatabase(): Promise<{
  url: string;
  db: ReturnType<typeof drizzle>;
}> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. E2E infrastructure tests require a running PostgreSQL instance. Set DATABASE_URL or skip these tests.",
    );
  }

  const dbName = `slotmerge_test_${process.pid}_${Date.now()}`;
  await createDatabase(dbName);

  const baseUrl =
    process.env.DATABASE_URL ?? "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";
  const match = baseUrl.match(/^(postgres:\/\/[^:]+:[^@]+@[^:]+:\d+)/);
  if (!match) {
    throw new Error(
      "Cannot derive test DATABASE_URL from DATABASE_URL. Expected format: postgres://user:pass@host:port/dbname",
    );
  }
  const url = `${match[1]}/${dbName}`;

  try {
    await runMigrations(url);
  } catch (e) {
    await dropDatabase(dbName);
    throw e;
  }

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
}

export function getTestDb(): ReturnType<typeof drizzle> | null {
  return globalTestDb;
}
