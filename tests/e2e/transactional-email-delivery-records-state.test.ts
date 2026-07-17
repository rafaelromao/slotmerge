import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";

import { createAdminInvitesHandlers } from "../../src/admin/invites";
import { systemClock } from "../../src/system/clock";
import { sealSessionCookie } from "../../src/auth/session";
import { sessions } from "../../src/db/schema";
import { createPostgresEmailEventRepository } from "../../src/email/repository";
import {
  createEmailDeliveryService,
  type QueueEmailJobInput,
} from "../../src/email/service";
import { processEmailDeliveryJob } from "../../src/email/worker";
import { buildMockEmailAdapter } from "../mock-email-adapter";
import { USER_FIXTURES } from "../fixtures/seeds";
import { getTestDb, setupTest } from "../helpers/setup";
import { buildTestClock } from "../test-clock";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

const MAGIC_LINK_SECRET = "test-magic-link-secret-124-characters-long";
const SESSION_SECRET = "test-session-secret-124-characters-long";
const INVITEE_EMAIL = "delivery-state-invitee@example.com";
const INVITE_ROLE = "user";
const BACKOFF_STEP_MS = 60_000;
const MOCK_FAILURE_ERROR = "mock delivery failure";

type EmailEventRow = {
  id: string;
  recipient: string;
  type: string;
  status: string;
  attempts: number;
  sent_at: string | null;
  failed_at: string | null;
  last_attempt_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  provider_message_id: string | null;
};

type EmailEventAttemptRow = {
  email_event_id: string;
  attempt_number: number;
  status: string;
  attempted_at: string;
  delivered_at: string | null;
  failed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  provider_message_id: string | null;
};

function toIso(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

async function readEmailEventByRecipient(
  recipient: string,
): Promise<EmailEventRow | null> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<EmailEventRow>(
    `SELECT id, recipient, type, status, attempts,
            sent_at, failed_at, last_attempt_at,
            last_error_code, last_error_message, provider_message_id
       FROM email_events
      WHERE recipient = '${recipient.replace(/'/g, "''")}'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function readEmailEventAttempts(
  emailEventId: string,
): Promise<EmailEventAttemptRow[]> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<EmailEventAttemptRow>(
    `SELECT email_event_id, attempt_number, status, attempted_at,
            delivered_at, failed_at, error_code, error_message, provider_message_id
       FROM email_event_attempts
      WHERE email_event_id = '${emailEventId}'
      ORDER BY attempt_number ASC`,
  );
  return result.rows;
}

describe("E2E: transactional email delivery records state", () => {
  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
    process.env.MAGIC_LINK_SECRET = MAGIC_LINK_SECRET;
    process.env.SESSION_SECRET = SESSION_SECRET;
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it.runIf(HAS_TEST_DB)(
    "records each delivery attempt, retries per backoff, and final state is visible in email_events and email_event_attempts",
    async () => {
      await setupTest();

      const db = getTestDb();
      if (!db) {
        throw new Error("test db not initialized");
      }

      const start = new Date("2026-07-12T12:00:00.000Z");
      const clock = buildTestClock(start);

      const adminUser = USER_FIXTURES[2];
      const adminSessionId = "00000000-0000-0000-0000-000000012401";
      const adminCsrfToken = "admin-csrf-124";
      await db.insert(sessions).values({
        id: adminSessionId,
        userId: adminUser.id,
        csrfToken: adminCsrfToken,
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        createdAt: start,
      });

      const queuedJobs: QueueEmailJobInput[] = [];
      const emailService = createEmailDeliveryService({
        clock: () => clock.now(),
        eventRepository: createPostgresEmailEventRepository(db),
        queueJob: (job) => {
          queuedJobs.push(job);
          return Promise.resolve();
        },
      });

      const { POST: postInvite } = createAdminInvitesHandlers({
        clock: systemClock(),
        emailDeliveryService: emailService,
      });

      const inviteResponse = await postInvite(
        new Request("http://localhost/admin/invites", {
          method: "POST",
          headers: {
            cookie: await sealSessionCookie({ sessionId: adminSessionId }),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            _csrf: adminCsrfToken,
            email: INVITEE_EMAIL,
            role: INVITE_ROLE,
          }).toString(),
        }),
      );

      expect(inviteResponse.status).toBe(303);
      expect(queuedJobs).toHaveLength(1);
      const queuedJob = queuedJobs[0];
      expect(queuedJob.recipient).toBe(INVITEE_EMAIL);
      expect(queuedJob.type).toBe("invite");

      const queuedEvent = await readEmailEventByRecipient(INVITEE_EMAIL);
      expect(queuedEvent).not.toBeNull();
      expect(queuedEvent?.status).toBe("queued");
      expect(queuedEvent?.attempts).toBe(0);

      const mockAdapter = buildMockEmailAdapter();
      mockAdapter.setSucceedsOnAttempt(3, MOCK_FAILURE_ERROR);

      const criticalEmail = {
        trigger: () => Promise.resolve({ deliveries: [] as ReadonlyArray<unknown> }),
      };

      const attemptClock = () => clock.now();
      const eventRepository = createPostgresEmailEventRepository(db);

      const attemptClockAt1 = attemptClock();
      await expect(
        processEmailDeliveryJob(queuedJob, {
          clock: attemptClock,
          eventRepository,
          transport: mockAdapter,
          criticalEmail,
        }),
      ).rejects.toThrow(MOCK_FAILURE_ERROR);

      const afterAttempt1 = await readEmailEventByRecipient(INVITEE_EMAIL);
      expect(afterAttempt1?.status).toBe("failed");
      expect(afterAttempt1?.attempts).toBe(1);
      expect(afterAttempt1?.last_error_message).toBe(MOCK_FAILURE_ERROR);
      expect(toIso(afterAttempt1?.failed_at ?? null)).toBe(
        attemptClockAt1.toISOString(),
      );
      expect(afterAttempt1?.sent_at).toBeNull();
      expect(toIso(afterAttempt1?.last_attempt_at ?? null)).toBe(
        attemptClockAt1.toISOString(),
      );

      clock.advance(BACKOFF_STEP_MS);
      const attemptClockAt2 = attemptClock();

      await expect(
        processEmailDeliveryJob(queuedJob, {
          clock: attemptClock,
          eventRepository,
          transport: mockAdapter,
          criticalEmail,
        }),
      ).rejects.toThrow(MOCK_FAILURE_ERROR);

      const afterAttempt2 = await readEmailEventByRecipient(INVITEE_EMAIL);
      expect(afterAttempt2?.status).toBe("failed");
      expect(afterAttempt2?.attempts).toBe(2);
      expect(afterAttempt2?.last_error_message).toBe(MOCK_FAILURE_ERROR);
      expect(toIso(afterAttempt2?.failed_at ?? null)).toBe(
        attemptClockAt2.toISOString(),
      );
      expect(toIso(afterAttempt2?.last_attempt_at ?? null)).toBe(
        attemptClockAt2.toISOString(),
      );

      clock.advance(BACKOFF_STEP_MS);
      const attemptClockAt3 = attemptClock();

      const finalEvent = await processEmailDeliveryJob(queuedJob, {
        clock: attemptClock,
        eventRepository,
        transport: mockAdapter,
        criticalEmail,
      });

      expect(finalEvent.status).toBe("sent");
      expect(finalEvent.attempts).toBe(3);
      expect(finalEvent.recipient).toBe(INVITEE_EMAIL);

      const finalRow = await readEmailEventByRecipient(INVITEE_EMAIL);
      expect(finalRow).not.toBeNull();
      expect(finalRow?.status).toBe("sent");
      expect(finalRow?.attempts).toBe(3);
      expect(toIso(finalRow?.sent_at ?? null)).toBe(
        attemptClockAt3.toISOString(),
      );
      expect(finalRow?.failed_at).toBeNull();
      expect(finalRow?.last_error_code).toBeNull();
      expect(finalRow?.last_error_message).toBeNull();
      expect(toIso(finalRow?.last_attempt_at ?? null)).toBe(
        attemptClockAt3.toISOString(),
      );
      expect(finalRow?.provider_message_id).toBe(
        `mock-${finalRow?.id ?? ""}`,
      );

      const attempts = await readEmailEventAttempts(
        finalRow?.id ?? "",
      );
      expect(attempts).toHaveLength(3);

      expect(attempts[0]).toMatchObject({
        attempt_number: 1,
        status: "failed",
        error_code: "mock-delivery-failure",
        error_message: MOCK_FAILURE_ERROR,
        provider_message_id: null,
      });
      expect(toIso(attempts[0].attempted_at)).toBe(
        attemptClockAt1.toISOString(),
      );
      expect(toIso(attempts[0].failed_at)).toBe(
        attemptClockAt1.toISOString(),
      );
      expect(attempts[0].delivered_at).toBeNull();

      expect(attempts[1]).toMatchObject({
        attempt_number: 2,
        status: "failed",
        error_code: "mock-delivery-failure",
        error_message: MOCK_FAILURE_ERROR,
        provider_message_id: null,
      });
      expect(toIso(attempts[1].attempted_at)).toBe(
        attemptClockAt2.toISOString(),
      );
      expect(toIso(attempts[1].failed_at)).toBe(
        attemptClockAt2.toISOString(),
      );
      expect(attempts[1].delivered_at).toBeNull();

      expect(attempts[2]).toMatchObject({
        attempt_number: 3,
        status: "sent",
        error_code: null,
        error_message: null,
      });
      expect(toIso(attempts[2].attempted_at)).toBe(
        attemptClockAt3.toISOString(),
      );
      expect(toIso(attempts[2].delivered_at)).toBe(
        attemptClockAt3.toISOString(),
      );
      expect(attempts[2].failed_at).toBeNull();
      expect(attempts[2].provider_message_id).toBe(
        `mock-${finalRow?.id ?? ""}`,
      );

      expect(mockAdapter.sends).toHaveLength(3);
      expect(mockAdapter.sends[0].status).toBe("failed");
      expect(mockAdapter.sends[1].status).toBe("failed");
      expect(mockAdapter.sends[2].status).toBe("sent");

      const visibleRow = await readEmailEventByRecipient(INVITEE_EMAIL);
      expect(visibleRow?.status).toBe("sent");
      expect(visibleRow?.attempts).toBe(3);
      expect(toIso(visibleRow?.sent_at ?? null)).toBe(
        attemptClockAt3.toISOString(),
      );
      expect(visibleRow?.provider_message_id).toBe(
        `mock-${finalRow?.id ?? ""}`,
      );
    },
  );
});
