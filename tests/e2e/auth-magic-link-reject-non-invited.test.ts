import { describe, expect, inject, it } from "vitest";

import { getTestClock, getTestDb, setupTest } from "../helpers/setup";
import { createMagicLinkRequestHandlers } from "../../src/auth/magic-link-request";
import type {
  EmailDeliveryService,
  EmailEvent,
  EmailType,
} from "../../src/email/service";

const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const HAS_TEST_DB = !!TEST_DB_URL;

if (HAS_TEST_DB) {
  process.env.DATABASE_URL = TEST_DB_URL;
}

type RecordedSend = {
  recipient: string;
  type: EmailType;
};

function createRecordingEmailService(): EmailDeliveryService & {
  sends: RecordedSend[];
} {
  const sends: RecordedSend[] = [];
  return {
    sends,
    sendEmail: async (input) => {
      sends.push({ recipient: input.recipient, type: input.type });
      await Promise.resolve();
      const now = new Date();
      const emailEvent: EmailEvent = {
        id: "evt-stub",
        recipient: input.recipient,
        type: input.type,
        payloadReference: "ref-stub",
        status: "sent",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        sentAt: now,
        failedAt: null,
        lastAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      };
      return { emailEvent };
    },
  };
}

async function countUsersByEmail(email: string): Promise<number> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ count: string }>(
    `SELECT COUNT(*) as count FROM users WHERE email = '${email.replace(/'/g, "''")}'`,
  );
  return Number(result.rows[0].count);
}

async function insertAcceptedInvite(email: string): Promise<void> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  await db.execute(
    `INSERT INTO invites (id, email, role, status, expires_at, created_at, updated_at) VALUES (gen_random_uuid(), '${email.replace(/'/g, "''")}', 'user', 'accepted', NOW() + INTERVAL '7 days', NOW(), NOW())`,
  );
}

async function countEmailEventsByRecipient(recipient: string): Promise<number> {
  const db = getTestDb();
  if (!db) {
    throw new Error("test db not initialized");
  }
  const result = await db.execute<{ count: string }>(
    `SELECT COUNT(*) as count FROM email_events WHERE recipient = '${recipient.replace(/'/g, "''")}'`,
  );
  return Number(result.rows[0].count);
}

async function submitMagicLinkRequest(email: string) {
  const emailService = createRecordingEmailService();
  const { POST } = createMagicLinkRequestHandlers({
    clock: getTestClock(),
    magicLinkSecret: "test-secret",
    emailDeliveryService: emailService,
  });
  const response = await POST(
    new Request("http://localhost/auth/magic-link/request", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
      body: new URLSearchParams({ email }),
    }),
  );
  const body = (await response.json()) as { error?: string; sent?: boolean };
  return { response, body, emailService };
}

describe("E2E: reject sign-in for non-invited email", () => {
  it.runIf(HAS_TEST_DB)(
    "returns 400 not_invited for an email with no matching invite or user",
    async () => {
      await setupTest();

      const { response, body, emailService } = await submitMagicLinkRequest(
        "unknown@example.com",
      );

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "not_invited" });
      expect(await countUsersByEmail("unknown@example.com")).toBe(0);
      expect(emailService.sends).toHaveLength(0);
      expect(
        await countEmailEventsByRecipient("unknown@example.com"),
      ).toBe(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "returns the same not_invited response when an accepted invite exists but no user account",
    async () => {
      await setupTest();
      await insertAcceptedInvite("accepted-invite@example.com");

      const { response, body, emailService } = await submitMagicLinkRequest(
        "accepted-invite@example.com",
      );

      expect(response.status).toBe(400);
      expect(body).toEqual({ error: "not_invited" });
      expect(
        await countUsersByEmail("accepted-invite@example.com"),
      ).toBe(0);
      expect(emailService.sends).toHaveLength(0);
      expect(
        await countEmailEventsByRecipient("accepted-invite@example.com"),
      ).toBe(0);
    },
  );

  it.runIf(HAS_TEST_DB)(
    "returns indistinguishable responses for unknown email and uninvited-but-known email",
    async () => {
      await setupTest();
      await insertAcceptedInvite("accepted-invite@example.com");

      const unknown = await submitMagicLinkRequest("unknown@example.com");
      const uninvited = await submitMagicLinkRequest(
        "accepted-invite@example.com",
      );

      expect(unknown.response.status).toBe(uninvited.response.status);
      expect(unknown.body).toEqual(uninvited.body);
      expect(unknown.body).toEqual({ error: "not_invited" });
      expect(unknown.response.headers.get("content-type")).toBe(
        uninvited.response.headers.get("content-type"),
      );

      expect(unknown.emailService.sends).toHaveLength(0);
      expect(uninvited.emailService.sends).toHaveLength(0);
      expect(await countUsersByEmail("unknown@example.com")).toBe(0);
      expect(
        await countUsersByEmail("accepted-invite@example.com"),
      ).toBe(0);
      expect(
        await countEmailEventsByRecipient("unknown@example.com"),
      ).toBe(0);
      expect(
        await countEmailEventsByRecipient("accepted-invite@example.com"),
      ).toBe(0);
    },
  );
});