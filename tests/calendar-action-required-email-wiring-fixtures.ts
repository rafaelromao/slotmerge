import { vi } from "vitest";

import { PATCH } from "../app/me/calendar-connections/[id]/route";
import {
  sealSessionCookie,
  setSessionRepositoryForTests,
} from "../src/auth/session";
import { encryptCalendarToken } from "../src/calendar/token-encryption";
import type { GoogleCalendarConnectionRecord } from "../src/calendar/google-calendar-connections";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../src/calendar/repository";

export const TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
export const SESSION_ID = "session-1";
export const CSRF_TOKEN = "csrf-token-1";
export const TEST_DATABASE_URL =
  "postgres://slotmerge:slotmerge@localhost:5432/slotmerge";
export const USER = {
  id: "user-1",
  email: "user@example.com",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  shortBio: null,
  role: "user" as const,
  status: "active" as const,
  profileTimezone: null,
  bufferMinutes: 0,
};

export function buildGoogleConnection(
  overrides: Partial<GoogleCalendarConnectionRecord> = {},
): GoogleCalendarConnectionRecord {
  return {
    id: "connection-1",
    userId: "user-1",
    provider: "google",
    providerAccountKey: "google:connection-1",
    accountIdentifier: "google:connection-1",
    scopes: "https://www.googleapis.com/auth/calendar.freebusy",
    status: "connected",
    refreshTokenEncrypted: encryptCalendarToken({
      plaintext: "refresh-token-123",
      key: TOKEN_ENCRYPTION_KEY,
    }),
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    contributingCalendarIds: [],
    ...overrides,
  };
}

export async function revoke(connection: GoogleCalendarConnectionRecord) {
  setSessionRepositoryForTests({
    findById: (sessionId) =>
      Promise.resolve(
        sessionId === SESSION_ID ? { user: USER, csrfToken: CSRF_TOKEN } : null,
      ),
  });
  setGoogleCalendarConnectionRepositoryForTests({
    createPending: (record) => Promise.resolve(record),
    listByUserId: () => Promise.resolve([connection]),
    findById: (id) =>
      Promise.resolve(id === connection.id ? { ...connection } : null),
    updateById: (id, patch) => {
      if (id !== connection.id) {
        return Promise.resolve(null);
      }
      Object.assign(connection, patch);
      return Promise.resolve({ ...connection });
    },
  });
  setMicrosoftCalendarConnectionRepositoryForTests({
    createPending: (record) => Promise.resolve(record),
    listByUserId: () => Promise.resolve([]),
    findById: () => Promise.resolve(null),
    updateById: () => Promise.resolve(null),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
  );

  const cookie = await sealSessionCookie({ sessionId: SESSION_ID });
  return PATCH(
    new Request("http://localhost/me/calendar-connections/connection-1", {
      method: "PATCH",
      headers: { cookie, "x-csrf-token": CSRF_TOKEN },
    }),
    { params: Promise.resolve({ id: connection.id }) },
  );
}