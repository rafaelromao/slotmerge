import {
  afterEach,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";

import { PATCH } from "../../app/me/calendar-connections/[id]/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../../src/auth/session";
import { encryptCalendarToken } from "../../src/calendar/token-encryption";
import { setEmailDeliveryServiceForTests } from "../../src/calendar/action-required-email-singleton";
import { setConnectionActionRequiredDispatchLookupForTests } from "../../src/calendar/action-required-email.repository";
import {
  buildMockEmailAdapter,
  type MockEmailAdapter,
} from "../mock-email-adapter";
import { calendarConnections } from "../../src/db/schema";
import type { EmailDeliveryService } from "../../src/email/service";
import {
  CALENDAR_CONNECTION_FIXTURES,
  SESSION_FIXTURES,
  USER_FIXTURES,
} from "../fixtures/seeds";
import { getTestDb } from "../helpers/setup";

const HAS_TEST_DB = inject("testDbUrl") !== undefined;
const TEST_DB_URL = inject("testDbUrl") as string | undefined;
const SESSION_SECRET = "0123456789abcdef0123456789abcdef";
const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
const APP_PUBLIC_URL = "https://slotmerge.example";
const ALICE_ID = USER_FIXTURES[0].id;
const CONNECTION_ID = CALENDAR_CONNECTION_FIXTURES[0].id;
const SESSION_ID = SESSION_FIXTURES[0].id;
const CSRF_TOKEN = SESSION_FIXTURES[0].csrfToken;

function aliceSession() {
  return {
    user: {
      id: ALICE_ID,
      email: USER_FIXTURES[0].email,
      displayName: USER_FIXTURES[0].displayName,
      avatarUrl: null,
      shortBio: null,
      role: USER_FIXTURES[0].role,
      status: USER_FIXTURES[0].status,
      profileTimezone: USER_FIXTURES[0].profileTimezone,
      bufferMinutes: USER_FIXTURES[0].bufferMinutes,
    },
    csrfToken: CSRF_TOKEN,
  };
}

function disconnectFetch(): Response {
  return new Response(null, { status: 200 });
}

async function patchDisconnect(): Promise<Response> {
  const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
  const body = JSON.stringify({ disconnect: true });
  return PATCH(
    new Request(`http://localhost/me/calendar-connections/${CONNECTION_ID}`, {
      method: "PATCH",
      headers: {
        cookie,
        "x-csrf-token": CSRF_TOKEN,
        "content-type": "application/json",
      },
      body,
    }),
    { params: Promise.resolve({ id: CONNECTION_ID }) },
  );
}

describe("E2E: calendar connection action-required email triggers on token revocation", () => {
  let emailAdapter: MockEmailAdapter;

  beforeAll(() => {
    if (TEST_DB_URL) {
      process.env.DATABASE_URL = TEST_DB_URL;
    }
  });

  afterAll(() => {
    if (TEST_DB_URL) {
      delete process.env.DATABASE_URL;
    }
  });

  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
    process.env.APP_PUBLIC_URL = APP_PUBLIC_URL;

    emailAdapter = buildMockEmailAdapter();

    const emailDeliveryService: EmailDeliveryService = {
      async sendEmail(input) {
        await emailAdapter.send({
          emailEventId: `mock-${input.recipient}`,
          recipient: input.recipient,
          type: input.type,
          payload: input.payload,
        });
        return {
          emailEvent: {
            id: `mock-${input.recipient}`,
            recipient: input.recipient,
            type: input.type,
            payloadReference: "mock-ref",
            status: "sent" as const,
            attempts: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            sentAt: new Date(),
            failedAt: null,
            lastAttemptAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        };
      },
    };
    setEmailDeliveryServiceForTests(emailDeliveryService);

    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });

    vi.stubGlobal("fetch", disconnectFetch);
  });

  afterEach(() => {
    setSessionRepositoryForTests(null);
    setEmailDeliveryServiceForTests(null);
    setConnectionActionRequiredDispatchLookupForTests(null);
    vi.unstubAllGlobals();
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    delete process.env.APP_PUBLIC_URL;
  });

  it.runIf(HAS_TEST_DB)(
    "disconnecting a connected calendar triggers action-required email with reconnect link",
    async () => {
      const db = getTestDb();
      expect(db).not.toBeNull();
      if (!db) {
        return;
      }

      await db
        .update(calendarConnections)
        .set({
          status: "connected",
          refreshTokenEncrypted: encryptCalendarToken({
            plaintext: "refresh-token-alice",
            key: TOKEN_ENCRYPTION_KEY,
          }),
          accessTokenEncrypted: encryptCalendarToken({
            plaintext: "access-token-alice",
            key: TOKEN_ENCRYPTION_KEY,
          }),
          accessTokenExpiresAt: new Date("2026-07-13T16:00:00.000Z"),
          contributingCalendarIds: ["primary"],
        })
        .where(eq(calendarConnections.id, CONNECTION_ID));

      setSessionRepositoryForTests({
        findById: (sessionId) =>
          Promise.resolve(sessionId === SESSION_ID ? aliceSession() : null),
      });

      const patchResponse = await patchDisconnect();
      expect(patchResponse.status).toBe(200);

      const actionRequiredSends = emailAdapter.getSendsByType(
        "calendar-action-required",
      );
      expect(actionRequiredSends).toHaveLength(1);

      const emailRecord = actionRequiredSends[0];
      expect(emailRecord.recipient).toBe(USER_FIXTURES[0].email);

      const payload = emailRecord.payload as {
        reason: string;
        reconnectUrl: string;
        connectionId: string;
        provider: string;
      };
      expect(payload.reason).toBe("token-revoked");
      expect(payload.connectionId).toBe(CONNECTION_ID);
      expect(payload.provider).toBe("google");
      expect(payload.reconnectUrl).toContain("/me/calendar-connections");
    },
  );
});
