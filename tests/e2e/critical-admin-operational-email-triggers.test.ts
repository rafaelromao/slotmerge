import { createHash } from "node:crypto";

import { afterAll, describe, expect, inject, it } from "vitest";

import {
  createPostgresAdminCriticalDispatchLookup,
  createPostgresAdminDirectory,
} from "../../src/admin/critical-email.repository";
import {
  createKindDedupReference,
  triggerAdminCriticalEmail,
  type OperationalEvent,
} from "../../src/admin/critical-email";
import { createPostgresEmailEventRepository } from "../../src/email/repository";
import { createEmailDeliveryService } from "../../src/email/service";
import { buildMockEmailAdapter } from "../mock-email-adapter";
import { buildTestClock } from "../test-clock";
import { FIXTURE_DATE, USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const TEST_DB_URL = inject("testDbUrl") as string | undefined;

const DEDUP_WINDOW_MS = 60_000;

const PROVIDER_EVENT_KIND = "provider-sync-failure";
const OTHER_PROVIDER_EVENT_KIND = "transactional-email-failure";

const PROVIDER_EVENT: OperationalEvent = {
  kind: PROVIDER_EVENT_KIND,
  summary: "Google Calendar free/busy returning 503 for multiple connections",
  occurredAt: new Date(FIXTURE_DATE),
  details: {
    provider: "google",
    affectedConnections: 12,
    sampleErrorCode: "upstream-unavailable",
  },
};

const OTHER_PROVIDER_EVENT: OperationalEvent = {
  kind: OTHER_PROVIDER_EVENT_KIND,
  summary: "Postmark SMTP timing out for transactional deliveries",
  occurredAt: new Date(FIXTURE_DATE),
  details: { provider: "postmark", affectedRecipients: 4 },
};

const EXTRA_ADMIN_EMAILS = [
  "second-admin@example.com",
  "third-admin@example.com",
];

function expectedAdminEmails(): string[] {
  return [USER_FIXTURES[2].email, ...EXTRA_ADMIN_EMAILS];
}

function expectedDedupReference(kind: string): string {
  return createKindDedupReference(kind);
}

function explicitDedupReference(kind: string): string {
  return createHash("sha256").update(JSON.stringify({ kind })).digest("hex");
}

async function insertExtraAdmins(): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const now = new Date(FIXTURE_DATE);
  const ids = [
    "00000000-0000-0000-0000-0000000000a1",
    "00000000-0000-0000-0000-0000000000a2",
  ];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const email = EXTRA_ADMIN_EMAILS[i];
    if (!id || !email) {
      continue;
    }
    const escapedEmail = email.replace(/'/g, "''");
    await db.execute(
      `INSERT INTO users (id, email, display_name, role, status, profile_timezone, buffer_minutes, created_at, updated_at)
       VALUES ('${id}', '${escapedEmail}', '${escapedEmail}', 'admin', 'active', 'UTC', 0, '${now.toISOString()}', '${now.toISOString()}')`,
    );
  }
}

type TriggerHarness = {
  sends: ReturnType<typeof buildMockEmailAdapter>["sends"];
  clock: ReturnType<typeof buildTestClock>;
  invoke(event: OperationalEvent): Promise<{
    deliveries: Array<
      | { recipient: string; status: "sent"; emailEventId: string }
      | { recipient: string; status: "failed"; error: string }
    >;
  }>;
};

function buildTriggerHarness(): TriggerHarness {
  const clock = buildTestClock(new Date(FIXTURE_DATE));
  const adapter = buildMockEmailAdapter();

  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }

  const emailDeliveryService = createEmailDeliveryService({
    clock: clock,
    eventRepository: createPostgresEmailEventRepository(db),
    queueJob: async (job) => {
      await adapter.send(job);
    },
  });

  const adminDirectory = createPostgresAdminDirectory(db);
  const dispatchLookup = createPostgresAdminCriticalDispatchLookup(db);

  return {
    sends: adapter.sends,
    clock,
    async invoke(event) {
      return triggerAdminCriticalEmail(
        { event },
        {
          adminDirectory,
          emailDeliveryService,
          lastDispatchLookup: dispatchLookup,
          clock: clock,
          dedupWindowMs: DEDUP_WINDOW_MS,
        },
      );
    },
  };
}

type AdminCriticalRow = {
  id: string;
  recipient: string;
  type: string;
  payload_reference: string;
  status: string;
};

async function selectAdminCriticalRows(): Promise<AdminCriticalRow[]> {
  const db = getTestDb();
  if (!db) {
    return [];
  }
  const result = await db.execute<AdminCriticalRow>(
    `SELECT id, recipient, type, payload_reference, status
     FROM email_events
     WHERE type = 'admin-critical'
     ORDER BY created_at, recipient`,
  );
  return result.rows;
}

describe("E2E: critical Admin operational email triggers", () => {
  if (TEST_DB_URL) {
    process.env.DATABASE_URL = TEST_DB_URL;
  }

  it.runIf(HAS_TEST_DB)(
    "trigger with provider-sync-failure sends one admin-critical email per active admin, records the delivery in the adapter, and persists the event",
    async () => {
      process.env.DATABASE_URL = TEST_DB_URL;

      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertExtraAdmins();

      const harness = buildTriggerHarness();
      const result = await harness.invoke(PROVIDER_EVENT);

      expect(result.deliveries).toHaveLength(3);
      const sentRecipients = result.deliveries
        .filter(
          (
            d,
          ): d is { recipient: string; status: "sent"; emailEventId: string } =>
            d.status === "sent",
        )
        .map((d) => d.recipient)
        .sort();
      expect(sentRecipients).toEqual(expectedAdminEmails());

      expect(harness.sends).toHaveLength(3);
      const recordedRecipients = harness.sends.map((s) => s.recipient).sort();
      expect(recordedRecipients).toEqual(expectedAdminEmails());
      for (const send of harness.sends) {
        expect(send.type).toBe("admin-critical");
        expect(send.status).toBe("sent");
        expect(send.payload).toMatchObject({
          kind: PROVIDER_EVENT_KIND,
          summary: PROVIDER_EVENT.summary,
          details: PROVIDER_EVENT.details,
        });
        expect(send.payload.occurredAt).toBe(
          PROVIDER_EVENT.occurredAt.toISOString(),
        );
        expect(send.providerMessageId).toBe(`mock-${send.emailEventId}`);
      }

      const dedupReference = expectedDedupReference(PROVIDER_EVENT_KIND);
      expect(dedupReference).toBe(explicitDedupReference(PROVIDER_EVENT_KIND));

      const rows = await selectAdminCriticalRows();
      expect(rows).toHaveLength(3);
      const rowRecipients = rows.map((r) => r.recipient).sort();
      expect(rowRecipients).toEqual(expectedAdminEmails());
      expect(new Set(rows.map((r) => r.payload_reference))).toEqual(
        new Set([dedupReference]),
      );
      for (const row of rows) {
        expect(row.type).toBe("admin-critical");
        expect(row.status).toBe("queued");
      }
    },
  );

  it.runIf(HAS_TEST_DB)(
    "trigger with the same kind inside the dedup window sends nothing and persists nothing new",
    async () => {
      process.env.DATABASE_URL = TEST_DB_URL;

      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertExtraAdmins();

      const harness = buildTriggerHarness();

      const first = await harness.invoke(PROVIDER_EVENT);
      expect(first.deliveries).toHaveLength(3);

      const rowsBefore = await selectAdminCriticalRows();
      const sendsBeforeLength = harness.sends.length;

      const second = await harness.invoke(PROVIDER_EVENT);
      expect(second.deliveries).toEqual([]);

      expect(harness.sends).toHaveLength(sendsBeforeLength);

      const rowsAfter = await selectAdminCriticalRows();
      expect(rowsAfter).toHaveLength(rowsBefore.length);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "trigger with a different kind inside the first kind's window still dispatches (per-kind dedup reference)",
    async () => {
      process.env.DATABASE_URL = TEST_DB_URL;

      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertExtraAdmins();

      const harness = buildTriggerHarness();

      const first = await harness.invoke(PROVIDER_EVENT);
      expect(first.deliveries).toHaveLength(3);

      const second = await harness.invoke(OTHER_PROVIDER_EVENT);
      expect(second.deliveries).toHaveLength(3);
      const secondRecipients = second.deliveries
        .filter(
          (
            d,
          ): d is { recipient: string; status: "sent"; emailEventId: string } =>
            d.status === "sent",
        )
        .map((d) => d.recipient)
        .sort();
      expect(secondRecipients).toEqual(expectedAdminEmails());

      const totalAdminCriticalSends = harness.sends.filter(
        (s) => s.type === "admin-critical",
      );
      expect(totalAdminCriticalSends).toHaveLength(6);

      const rows = await selectAdminCriticalRows();
      expect(rows).toHaveLength(6);
      expect(new Set(rows.map((r) => r.payload_reference))).toEqual(
        new Set([
          expectedDedupReference(PROVIDER_EVENT_KIND),
          expectedDedupReference(OTHER_PROVIDER_EVENT_KIND),
        ]),
      );
    },
  );

  it.runIf(HAS_TEST_DB)(
    "trigger with the same kind after advancing the clock past the dedup window dispatches again",
    async () => {
      process.env.DATABASE_URL = TEST_DB_URL;

      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await setupTest();
      await insertExtraAdmins();

      const harness = buildTriggerHarness();

      const first = await harness.invoke(PROVIDER_EVENT);
      expect(first.deliveries).toHaveLength(3);
      const rowsBefore = await selectAdminCriticalRows();
      expect(rowsBefore).toHaveLength(3);

      harness.clock.advance(DEDUP_WINDOW_MS + 1_000);

      const second = await harness.invoke(PROVIDER_EVENT);
      expect(second.deliveries).toHaveLength(3);
      const secondRecipients = second.deliveries
        .filter(
          (
            d,
          ): d is { recipient: string; status: "sent"; emailEventId: string } =>
            d.status === "sent",
        )
        .map((d) => d.recipient)
        .sort();
      expect(secondRecipients).toEqual(expectedAdminEmails());

      const rowsAfter = await selectAdminCriticalRows();
      expect(rowsAfter).toHaveLength(rowsBefore.length + 3);
    },
  );
});

afterAll(() => {
  if (TEST_DB_URL) {
    delete process.env.DATABASE_URL;
  }
});
