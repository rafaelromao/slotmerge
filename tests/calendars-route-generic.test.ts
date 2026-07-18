import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { setCalendarConnectionRepositoryForTests } from "../src/calendar/repository";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
  type SessionUser,
} from "../src/auth/session";
import { encryptCalendarToken } from "../src/calendar/token-encryption";
import { GET } from "../app/me/calendar-connections/[id]/calendars/route";

const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

const SESSION_ID = "session-1";
const USER: SessionUser = {
  id: "user-1",
  email: "user@example.com",
  displayName: "User",
  avatarUrl: null,
  shortBio: null,
  role: "user",
  status: "active",
  profileTimezone: null,
  bufferMinutes: 0,
};
const CSRF_TOKEN = "csrf-token-1";

const SESSION_SECRET =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("GET /me/calendar-connections/[id]/calendars", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    setSessionRepositoryForTests(null);
    setCalendarConnectionRepositoryForTests(null);
    vi.unstubAllGlobals();
  });

  it("returns Microsoft Graph calendars with isIncluded marker, no provider branch", async () => {
    setSessionRepositoryForTests({
      findById: (sessionId) =>
        Promise.resolve(
          sessionId === SESSION_ID
            ? { user: USER, csrfToken: CSRF_TOKEN }
            : null,
        ),
    });

    const connection = {
      id: "microsoft-connection-1",
      userId: USER.id,
      provider: "microsoft" as const,
      accountIdentifier: `microsoft:microsoft-connection-1`,
      providerAccountKey: `microsoft:microsoft-connection-1`,
      scopes: "Calendars.Read",
      status: "connected" as const,
      accessTokenEncrypted: encryptCalendarToken({
        plaintext: "ms-access-token",
        key: TOKEN_ENCRYPTION_KEY,
      }),
      refreshTokenEncrypted: encryptCalendarToken({
        plaintext: "ms-refresh-token",
        key: TOKEN_ENCRYPTION_KEY,
      }),
      accessTokenExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      contributingCalendarIds: ["AAMkAD-primary="],
    };

    setCalendarConnectionRepositoryForTests({
      createPending: (record) => Promise.resolve(record),
      listByUserId: () => Promise.resolve([connection]),
      findById: (id) =>
        Promise.resolve(id === connection.id ? { ...connection } : null),
      updateById: () => Promise.resolve(null),
    });

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "AAMkAD-primary=",
              name: "Calendar",
              isPrimaryCalendar: true,
            },
            {
              id: "AAMkAD-second=",
              name: "Holidays",
              isPrimaryCalendar: false,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", fetchImpl);

    const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
    const response = await GET(
      new Request(
        `https://example.com/me/calendar-connections/${connection.id}/calendars`,
        {
          headers: { cookie },
        },
      ),
      { params: Promise.resolve({ id: connection.id }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      calendars: Array<{
        id: string;
        name: string;
        isPrimary: boolean;
        isIncluded: boolean;
      }>;
    };
    expect(body.calendars).toEqual([
      {
        id: "AAMkAD-primary=",
        name: "Calendar",
        isPrimary: true,
        isIncluded: true,
      },
      {
        id: "AAMkAD-second=",
        name: "Holidays",
        isPrimary: false,
        isIncluded: false,
      },
    ]);
  });
});
