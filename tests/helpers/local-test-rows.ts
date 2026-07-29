import { Pool } from "pg";

import { FIXTURE_DATE } from "../fixtures/seeds";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set for local-test-rows helper");
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export async function assertLocalTestRowsEnabled(
  baseUrl = "http://localhost:3000",
): Promise<void> {
  const envOk =
    process.env.APP_ENV === "local" || process.env.APP_ENV === "test";
  if (!envOk) {
    throw new Error(
      `local-test-rows requires APP_ENV in {local,test} (current: ${process.env.APP_ENV ?? "unset"})`,
    );
  }
  if (process.env.LOCAL_TEST_HELPERS !== "true") {
    throw new Error(
      "local-test-rows requires LOCAL_TEST_HELPERS=true to be set",
    );
  }
  const response = await fetch(`${baseUrl}/api/local/health`);
  if (!response.ok) {
    throw new Error(
      `local-test-rows requires the local health gate at ${baseUrl}/api/local/health to return 200 (got ${response.status}). Run \`pnpm local:up\` first.`,
    );
  }
}

export type LocalTestRowInput = {
  needsReconnectCount?: number;
  failedEmailCount?: number;
  tokensExpiringSoonCount?: number;
};

export async function insertLocalTestRows(
  input: LocalTestRowInput,
): Promise<void> {
  await assertLocalTestRowsEnabled();

  const db = getPool();
  const client = await db.connect();
  const fixtureDate = new Date(FIXTURE_DATE);
  try {
    await client.query("BEGIN");

    for (let i = 0; i < (input.needsReconnectCount ?? 0); i += 1) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO calendar_connections (
          id, user_id, provider, status, contributing_calendar_ids,
          created_at, updated_at
        ) VALUES ($1, $2, 'google', 'needs_reconnect', '{}', $3, $3)
        ON CONFLICT (id) DO UPDATE SET status = 'needs_reconnect'`,
        [id, "00000000-0000-0000-0000-000000000001", fixtureDate],
      );
    }

    for (let i = 0; i < (input.failedEmailCount ?? 0); i += 1) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO email_events (
          id, recipient, type, payload_reference, status,
          attempts, created_at, updated_at, failed_at, last_error_code, last_error_message
        ) VALUES (
          $1, $2, 'invite', 'local-test-rows', 'failed',
           1, $3, $3, $3, 'smtp-timeout', 'Upstream SMTP timed out'
        )
        ON CONFLICT (id) DO UPDATE SET status = 'failed'`,
        [id, `local-test-${i}@example.com`, fixtureDate],
      );
    }

    for (let i = 0; i < (input.tokensExpiringSoonCount ?? 0); i += 1) {
      const id = crypto.randomUUID();
      const expiresAt = new Date(new Date(FIXTURE_DATE).getTime() + 60 * 1000);
      await client.query(
        `INSERT INTO calendar_connections (
          id, user_id, provider, status, access_token_expires_at,
          contributing_calendar_ids, created_at, updated_at
        ) VALUES ($1, $2, 'google', 'connected', $3, '{}', $4, $4)
        ON CONFLICT (id) DO UPDATE SET access_token_expires_at = $3`,
        [id, "00000000-0000-0000-0000-000000000001", expiresAt, fixtureDate],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupLocalTestRows(): Promise<void> {
  if (!pool) {
    return;
  }
  const db = pool;
  // Only delete rows that are NOT seeded fixtures. Seeded fixtures use
  // well-known UUIDs (see tests/fixtures/seeds.ts).
  await db.query(
    `DELETE FROM calendar_connections
      WHERE id NOT IN (
        '00000000-0000-0000-0000-000000000030',
        '00000000-0000-0000-0000-000000000031'
      )
      AND created_at = $1`,
    [new Date(FIXTURE_DATE)],
  );
  await db.query(
    `DELETE FROM email_events
      WHERE payload_reference = 'local-test-rows'`,
  );
}
