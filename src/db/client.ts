import { Pool } from "pg";

import { loadRuntimeConfig } from "../config/runtime";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const config = loadRuntimeConfig();
    pool = new Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}

export async function checkDatabase(): Promise<void> {
  await getPool().query("select 1");
}
