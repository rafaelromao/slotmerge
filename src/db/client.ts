import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let pool: Pool | null = null;

function requireDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database access.");
  }
  return process.env.DATABASE_URL;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: requireDatabaseUrl() });
  }
  return pool;
}

export type AppDb = ReturnType<typeof drizzle>;

export function getDb(): AppDb {
  pool ??= new Pool({ connectionString: requireDatabaseUrl() });
  return drizzle(pool, { schema });
}

export async function checkDatabase(): Promise<void> {
  await getPool().query("select 1");
}
