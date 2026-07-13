/**
 * Database reset helper for E2E tests.
 * Truncates all tables and re-applies migrations between tests.
 *
 * E2E coverage: all slices — tests 1-62
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

function getMigrationFiles(): string[] {
  const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && e.name !== "meta")
    .map((e) => e.name)
    .sort();

  const files: string[] = [];
  for (const dir of dirs) {
    const dirPath = join(MIGRATIONS_DIR, dir);
    const dirEntries = readdirSync(dirPath).filter((f) => f.endsWith(".sql"));
    for (const file of dirEntries.sort()) {
      files.push(join(dirPath, file));
    }
  }
  return files;
}

export async function resetDatabase(): Promise<void> {
  const dropSql = `
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END;
$$;
`;

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    await pool.query(dropSql);

    const migrationFiles = getMigrationFiles();
    for (const file of migrationFiles) {
      const sql = readFileSync(file, "utf-8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

export async function createInvite(data: {
  email: string;
  role?: string;
  status?: string;
  expiresAt?: Date;
  magicLinkGeneration?: number;
}): Promise<{
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  magicLinkGeneration: number;
}> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    const result = await pool.query<{
      id: string;
      email: string;
      role: string;
      status: string;
      expiresAt: Date;
      magic_link_generation: number;
    }>(
      `INSERT INTO invites (email, role, status, expires_at, magic_link_generation)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, role, status, expires_at, magic_link_generation`,
      [
        data.email,
        data.role ?? "user",
        data.status ?? "pending",
        data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        data.magicLinkGeneration ?? 0,
      ],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expiresAt,
      magicLinkGeneration: row.magic_link_generation,
    };
  } finally {
    await pool.end();
  }
}

export async function createUser(data: {
  id?: string;
  email: string;
  displayName?: string | null;
  role?: string;
  status?: string;
  profileTimezone?: string;
  bufferMinutes?: number;
}): Promise<{
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  profileTimezone: string | null;
  bufferMinutes: number;
}> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    const result = await pool.query<{
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      status: string;
      profile_timezone: string | null;
      buffer_minutes: number;
    }>(
      `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, display_name, role, status, profile_timezone, buffer_minutes`,
      [
        data.id ?? null,
        data.email,
        data.displayName ?? null,
        data.role ?? "user",
        data.status ?? "active",
        data.profileTimezone ?? null,
        data.bufferMinutes ?? 0,
      ],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      profileTimezone: row.profile_timezone,
      bufferMinutes: row.buffer_minutes,
    };
  } finally {
    await pool.end();
  }
}

export async function getUserByEmail(
  email: string,
): Promise<Record<string, unknown> | null> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    const result = await pool.query<Record<string, unknown>>(
      "SELECT * FROM users WHERE email = $1",
      [email],
    );
    return result.rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

export { TEST_DATABASE_URL };
