import { createPostgresImportedBusyIntervalRepository } from "../calendar/imported-busy-intervals.repository";
import { decryptCalendarToken } from "../calendar/token-encryption";
import { listActiveConnections } from "../calendar/repository";
import { syncCalendarConnection } from "../calendar/sync";
import {
  recordCalendarConnectionSyncFailure,
  type CalendarConnectionUserLookup,
} from "../calendar/sync-failure-recorder";
import { loadRuntimeConfig } from "../config/runtime";

export const pollCalendarConnectionsTaskName = "poll_calendar_connections";

export async function handlePollCalendarConnectionsJob(): Promise<void> {
  const config = loadRuntimeConfig();
  const activeConnections = await listActiveConnections();

  for (const { record: connection } of activeConnections) {
    const tokenEncryptionKey = config.calendarTokenEncryptionKey;
    const accessToken = decryptCalendarToken({
      ciphertext: connection.accessTokenEncrypted ?? "",
      key: tokenEncryptionKey,
    });

    const busyIntervalRepository =
      createPostgresImportedBusyIntervalRepository();

    const connectionLookup: CalendarConnectionUserLookup = async (connId) => {
      const conn = await listActiveConnections().then((cs) =>
        cs.find((c) => c.record.id === connId),
      );
      if (!conn) return null;
      return {
        id: conn.record.id,
        userId: conn.record.userId,
        provider: conn.provider,
        user: { email: "", displayName: null },
      };
    };

    await syncCalendarConnection({
      connectionId: connection.id,
      provider: connection.provider,
      accessToken,
      contributingCalendarIds: connection.contributingCalendarIds,
      userId: connection.userId,
      fetchImpl: fetch,
      busyIntervalRepository,
      recordFailure: (input) =>
        recordCalendarConnectionSyncFailure(
          {
            connectionId: connection.id,
            provider: connection.provider,
            code: input.code,
            message: input.message,
          },
          { connectionLookup },
        ),
      clock: () => new Date(),
    });
  }
}
