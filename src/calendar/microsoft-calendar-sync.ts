import { randomUUID } from "node:crypto";

import { decryptCalendarToken } from "./token-encryption";
import type {
  CalendarConnectionSyncRecord,
  CalendarSyncProviderClient,
} from "./sync";

const MICROSOFT_GET_SCHEDULE_ENDPOINT =
  "https://graph.microsoft.com/v1.0/me/calendar/getSchedule";

export function createMicrosoftCalendarSyncClient({
  fetchImpl = fetch,
  tokenEncryptionKey,
}: {
  fetchImpl?: typeof fetch;
  tokenEncryptionKey: string;
}): CalendarSyncProviderClient {
  return {
    async fetchImportedBusyIntervals({ connection, now }) {
      const accessToken = getAccessToken(connection, tokenEncryptionKey);
      const response = await fetchImpl(MICROSOFT_GET_SCHEDULE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          schedules:
            connection.contributingCalendarIds.length > 0
              ? connection.contributingCalendarIds
              : [connection.userId],
          startTime: {
            dateTime: now.toISOString(),
            timeZone: "UTC",
          },
          endTime: {
            dateTime: new Date(
              now.getTime() + 90 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            timeZone: "UTC",
          },
          availabilityViewInterval: 60,
        }),
      });

      if (!response.ok) {
        throw createProviderSyncError("microsoft", response);
      }

      const payload = (await response.json()) as {
        value?: Array<{
          scheduleId?: string;
          availabilityView?: string;
          scheduleItems?: Array<{
            status?: string;
            start?: { dateTime?: string };
            end?: { dateTime?: string };
          }>;
        }>;
      };

      const importedAt = now;
      const intervals = (payload.value ?? []).flatMap((schedule) => {
        const scheduleId = schedule.scheduleId ?? "primary";
        if (schedule.scheduleItems && schedule.scheduleItems.length > 0) {
          return schedule.scheduleItems.flatMap((item) => {
            const status = mapMicrosoftStatus(item.status);
            if (!status || !item.start?.dateTime || !item.end?.dateTime) {
              return [];
            }

            return [
              {
                id: randomUUID(),
                userId: connection.userId,
                connectionId: connection.id,
                providerCalendarId: scheduleId,
                providerEventReference: null,
                status,
                startAt: new Date(item.start.dateTime),
                endAt: new Date(item.end.dateTime),
                importedAt,
              },
            ];
          });
        }

        const view = schedule.availabilityView ?? "";
        const slotMinutes = 60;
        return view.split("").flatMap((slot, index) => {
          const status = mapMicrosoftViewSlot(slot);
          if (!status) {
            return [];
          }

          const startAt = new Date(
            now.getTime() + index * slotMinutes * 60_000,
          );
          const endAt = new Date(startAt.getTime() + slotMinutes * 60_000);
          return [
            {
              id: randomUUID(),
              userId: connection.userId,
              connectionId: connection.id,
              providerCalendarId: scheduleId,
              providerEventReference: null,
              status,
              startAt,
              endAt,
              importedAt,
            },
          ];
        });
      });

      return intervals;
    },
  };
}

function getAccessToken(
  connection: CalendarConnectionSyncRecord,
  tokenEncryptionKey: string,
): string {
  if (!connection.accessTokenEncrypted) {
    throw new Error("microsoft_calendar_connection_missing_access_token");
  }

  return decryptCalendarToken({
    ciphertext: connection.accessTokenEncrypted,
    key: tokenEncryptionKey,
  });
}

function mapMicrosoftStatus(
  status?: string,
): "busy" | "out-of-office" | "tentative" | null {
  if (status === "busy" || status === "workingElsewhere") {
    return "busy";
  }
  if (status === "oof") {
    return "out-of-office";
  }
  if (status === "tentative") {
    return "tentative";
  }
  return null;
}

function mapMicrosoftViewSlot(
  slot: string,
): "busy" | "out-of-office" | "tentative" | null {
  if (slot === "2" || slot === "4") {
    return "busy";
  }
  if (slot === "3") {
    return "out-of-office";
  }
  if (slot === "1") {
    return "tentative";
  }
  return null;
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
