import type { SyncCalendarConnectionPayload } from "./sync-jobs";
import {
  findCalendarConnectionById,
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "./repository";
import { getImportedBusyIntervalRepository } from "./imported-busy-intervals";
import { recordCalendarConnectionSyncFailure } from "./sync-failure-recorder";
import {
  ROLLING_WINDOW_DAYS,
  type ImportedBusyIntervalRecord,
} from "./imported-busy-intervals";
import { decryptCalendarToken } from "./token-encryption";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

export type SyncJobDependencies = {
  fetchImpl: typeof fetch;
  decryptToken: (ciphertext: string) => string;
};

export async function handleSyncCalendarConnectionJob(
  payload: unknown,
  deps?: SyncJobDependencies,
): Promise<void> {
  const syncPayload = parseSyncPayload(payload);
  if (!syncPayload) {
    return;
  }

  const { connectionId, attemptNumber = 1 } = syncPayload;
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const decryptToken = deps?.decryptToken ?? decryptCalendarToken;

  const connection = await findCalendarConnectionById(connectionId);
  if (!connection) {
    await recordCalendarConnectionSyncFailure(
      {
        connectionId,
        provider: "google",
        code: "connection_not_found",
        message: "Calendar connection not found",
      },
      {
        connectionLookup: async () => null,
      },
    );
    return;
  }

  try {
    if (connection.provider === "google") {
      await syncGoogleCalendarConnection(connection.record, {
        fetchImpl,
        decryptToken,
        connectionLookup: async () => ({
          id: connection.record.id,
          userId: connection.record.userId,
          provider: "google",
          user: { email: "user@example.com", displayName: null },
        }),
      });
    } else {
      await syncMicrosoftCalendarConnection(connection.record, {
        fetchImpl,
        decryptToken,
        connectionLookup: async () => ({
          id: connection.record.id,
          userId: connection.record.userId,
          provider: "microsoft",
          user: { email: "user@example.com", displayName: null },
        }),
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown_error";
    const message = error instanceof Error ? error.message : String(error);

    await recordCalendarConnectionSyncFailure(
      {
        connectionId,
        provider: connection.provider,
        code,
        message,
      },
      {
        connectionLookup: async () => ({
          id: connection.record.id,
          userId: connection.record.userId,
          provider: connection.provider,
          user: { email: "user@example.com", displayName: null },
        }),
      },
    );
  }
}

async function syncGoogleCalendarConnection(
  connection: {
    id: string;
    userId: string;
    refreshTokenEncrypted: string | null;
    accessTokenEncrypted: string | null;
    accessTokenExpiresAt: Date | null;
    contributingCalendarIds: string[];
  },
  deps: {
    fetchImpl: typeof fetch;
    decryptToken: (ciphertext: string) => string;
    connectionLookup: () => Promise<{
      id: string;
      userId: string;
      provider: "google";
      user: { email: string; displayName: string | null };
    } | null>;
  },
): Promise<void> {
  const { fetchImpl, decryptToken, connectionLookup } = deps;

  const refreshToken = connection.refreshTokenEncrypted
    ? decryptToken(connection.refreshTokenEncrypted)
    : null;

  if (!refreshToken) {
    throw new Error("google_no_refresh_token");
  }

  const accessToken = await refreshGoogleAccessToken(
    refreshToken,
    fetchImpl,
  );

  if (!accessToken) {
    throw new Error("google_token_refresh_failed");
  }

  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const intervals = await fetchGoogleFreeBusy(
    accessToken,
    connection.contributingCalendarIds,
    now.toISOString(),
    windowEnd.toISOString(),
    fetchImpl,
  );

  const busyIntervals: ImportedBusyIntervalRecord[] = intervals.map((item) => ({
    id: `google-${connection.id}-${item.startAt}-${item.endAt}`,
    userId: connection.userId,
    connectionId: connection.id,
    providerCalendarId: item.calendarId,
    providerEventReference: null,
    status: item.status,
    startAt: new Date(item.startAt),
    endAt: new Date(item.endAt),
    importedAt: now,
  }));

  const repo = getImportedBusyIntervalRepository();
  await repo.upsertBatch(busyIntervals);
}

async function fetchGoogleAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchGoogleFreeBusy(
  accessToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string,
  fetchImpl: typeof fetch,
): Promise<
  Array<{ calendarId: string; startAt: string; endAt: string; status: "busy" }>
> {
  const response = await fetchImpl(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`google_freebusy_failed_${response.status}`);
  }

  const data = (await response.json()) as {
    calendars?: Record<
      string,
      { busy?: Array<{ start: string; end: string }> }
    >;
  };

  const intervals: Array<{
    calendarId: string;
    startAt: string;
    endAt: string;
    status: "busy";
  }> = [];

  for (const [calendarId, calendarData] of Object.entries(
    data.calendars ?? {},
  )) {
    for (const busy of calendarData.busy ?? []) {
      intervals.push({
        calendarId,
        startAt: busy.start,
        endAt: busy.end,
        status: "busy",
      });
    }
  }

  return intervals;
}

async function syncMicrosoftCalendarConnection(
  connection: {
    id: string;
    userId: string;
    refreshTokenEncrypted: string | null;
    accessTokenEncrypted: string | null;
    accessTokenExpiresAt: Date | null;
    contributingCalendarIds: string[];
  },
  deps: {
    fetchImpl: typeof fetch;
    decryptToken: (ciphertext: string) => string;
    connectionLookup: () => Promise<{
      id: string;
      userId: string;
      provider: "microsoft";
      user: { email: string; displayName: string | null };
    } | null>;
  },
): Promise<void> {
  const { fetchImpl, decryptToken, connectionLookup } = deps;

  const refreshToken = connection.refreshTokenEncrypted
    ? decryptToken(connection.refreshTokenEncrypted)
    : null;

  if (!refreshToken) {
    throw new Error("microsoft_no_refresh_token");
  }

  const accessToken = await refreshMicrosoftAccessToken(
    refreshToken,
    fetchImpl,
  );

  if (!accessToken) {
    throw new Error("microsoft_token_refresh_failed");
  }

  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const intervals = await fetchMicrosoftGetSchedule(
    accessToken,
    connection.accountIdentifier ?? "",
    now.toISOString(),
    windowEnd.toISOString(),
    fetchImpl,
  );

  const busyIntervals: ImportedBusyIntervalRecord[] = intervals.map((item) => ({
    id: `microsoft-${connection.id}-${item.startAt}-${item.endAt}`,
    userId: connection.userId,
    connectionId: connection.id,
    providerCalendarId: "primary",
    providerEventReference: null,
    status: item.status,
    startAt: new Date(item.startAt),
    endAt: new Date(item.endAt),
    importedAt: now,
  }));

  const repo = getImportedBusyIntervalRepository();
  await repo.upsertBatch(busyIntervals);
}

async function refreshMicrosoftAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchMicrosoftGetSchedule(
  accessToken: string,
  userId: string,
  timeMin: string,
  timeMax: string,
  fetchImpl: typeof fetch,
): Promise<
  Array<{ startAt: string; endAt: string; status: "busy" | "tentative" }>
> {
  const response = await fetchImpl(
    `${MICROSOFT_GRAPH_ENDPOINT}/me/calendar/getSchedule`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        schedules: [userId],
        startTime: { dateTime: timeMin, timeZone: "UTC" },
        endTime: { dateTime: timeMax, timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(`microsoft_rate_limited_retry_after_${retryAfter ?? "default"}`);
    }
    throw new Error(`microsoft_getschedule_failed_${response.status}`);
  }

  const data = (await response.json()) as {
    value?: Array<{
      scheduleItems?: Array<{
        start: string;
        end: string;
        status: string;
      }>;
    }>;
  };

  const intervals: Array<{ startAt: string; endAt: string; status: "busy" | "tentative" }> = [];

  for (const schedule of data.value ?? []) {
    for (const item of schedule.scheduleItems ?? []) {
      if (item.status === "busy" || item.status === "tentative") {
        intervals.push({
          startAt: item.start,
          endAt: item.end,
          status: item.status as "busy" | "tentative",
        });
      }
    }
  }

  return intervals;
}

function parseSyncPayload(
  payload: unknown,
): SyncCalendarConnectionPayload | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "connectionId" in payload &&
    typeof payload.connectionId === "string"
  ) {
    return {
      connectionId: payload.connectionId,
      attemptNumber:
        typeof payload.attemptNumber === "number"
          ? payload.attemptNumber
          : 1,
    };
  }
  return null;
}