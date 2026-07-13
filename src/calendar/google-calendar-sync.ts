import { randomUUID } from "node:crypto";

import { decryptCalendarToken } from "./token-encryption";
import type {
  CalendarConnectionSyncRecord,
  CalendarSyncProviderClient,
} from "./sync";

const GOOGLE_FREEBUSY_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/freeBusy";

export function createGoogleCalendarSyncClient({
  fetchImpl = fetch,
  tokenEncryptionKey,
}: {
  fetchImpl?: typeof fetch;
  tokenEncryptionKey: string;
}): CalendarSyncProviderClient {
  return {
    async fetchImportedBusyIntervals({ connection, now }) {
      const accessToken = getAccessToken(connection, tokenEncryptionKey);
      const response = await fetchImpl(GOOGLE_FREEBUSY_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          timeMin: now.toISOString(),
          timeMax: new Date(
            now.getTime() + 90 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          items: (connection.contributingCalendarIds.length > 0
            ? connection.contributingCalendarIds
            : ["primary"]
          ).map((id) => ({ id })),
        }),
      });

      if (!response.ok) {
        throw createProviderSyncError("google", response);
      }

      const payload = (await response.json()) as {
        calendars?: Record<
          string,
          { busy?: Array<{ start: string; end: string }> }
        >;
      };

      const importedAt = now;
      const intervals = Object.entries(payload.calendars ?? {}).flatMap(
        ([providerCalendarId, calendar]) =>
          (calendar.busy ?? []).map((busy) => ({
            id: randomUUID(),
            userId: connection.userId,
            connectionId: connection.id,
            providerCalendarId,
            providerEventReference: null,
            status: "busy" as const,
            startAt: new Date(busy.start),
            endAt: new Date(busy.end),
            importedAt,
          })),
      );

      return intervals;
    },
  };
}

function getAccessToken(
  connection: CalendarConnectionSyncRecord,
  tokenEncryptionKey: string,
): string {
  if (!connection.accessTokenEncrypted) {
    throw new Error("google_calendar_connection_missing_access_token");
  }

  return decryptCalendarToken({
    ciphertext: connection.accessTokenEncrypted,
    key: tokenEncryptionKey,
  });
}

function createProviderSyncError(provider: string, response: Response): Error {
  const retryAfter = response.headers.get("retry-after");
  const error = new Error(`${provider} calendar sync failed`);
  Object.assign(error, {
    kind:
      response.status === 429 || response.status >= 500
        ? "transient"
        : "permanent",
    code: response.status === 429 ? "rate-limited" : "sync-failed",
    retryAfter,
  });
  return error;
}
