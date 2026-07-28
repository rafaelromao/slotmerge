import { Pool } from "pg";

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
  try {
    await client.query("BEGIN");

    for (let i = 0; i < (input.needsReconnectCount ?? 0); i += 1) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO calendar_connections (
          id, user_id, provider, status, contributing_calendar_ids,
          created_at, updated_at
        ) VALUES ($1, $2, 'google', 'needs_reconnect', '{}', now(), now())
        ON CONFLICT (id) DO UPDATE SET status = 'needs_reconnect'`,
        [id, "00000000-0000-0000-0000-000000000001"],
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
          1, now(), now(), now(), 'smtp-timeout', 'Upstream SMTP timed out'
        )
        ON CONFLICT (id) DO UPDATE SET status = 'failed'`,
        [id, `local-test-${i}@example.com`],
      );
    }

    for (let i = 0; i < (input.tokensExpiringSoonCount ?? 0); i += 1) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO calendar_connections (
          id, user_id, provider, status, access_token_expires_at,
          contributing_calendar_ids, created_at, updated_at
        ) VALUES ($1, $2, 'google', 'connected', now() + interval '60 seconds', '{}', now(), now())
        ON CONFLICT (id) DO UPDATE SET access_token_expires_at = now() + interval '60 seconds'`,
        [id, "00000000-0000-0000-0000-000000000001"],
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
     AND created_at > now() - interval '10 minutes'`,
  );
  await db.query(
    `DELETE FROM email_events
     WHERE id NOT IN (SELECT id FROM email_events WHERE created_at < now() - interval '10 minutes')
     AND created_at > now() - interval '10 minutes'`,
  );
}