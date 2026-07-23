import Iron from "@hapi/iron";
import { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  CalendarConnectionStatus,
  CalendarProvider as CalendarProviderId,
} from "../db/schema";
import type { CalendarProvider } from "./provider";
import { systemClock } from "../system/clock";
import { decryptCalendarToken, encryptCalendarToken } from "./token-encryption";

export type CalendarConnectionRecord = {
  id: string;
  userId: string;
  provider: CalendarProviderId;
  providerAccountKey: string | null;
  accountIdentifier: string | null;
  scopes: string | null;
  status: CalendarConnectionStatus;
  refreshTokenEncrypted: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt?: Date | null;
  contributingCalendarIds: string[];
};

export type CalendarConnectionView = {
  id: string;
  provider: CalendarProviderId;
  accountIdentifier: string | null;
  providerAccountKey: string | null;
  scopes: string | null;
  status: CalendarConnectionStatus;
  accessTokenExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt: Date | null;
  contributingCalendarIds: string[];
};

export type CalendarConnectionRepository = {
  createPending(
    record: CalendarConnectionRecord,
  ): Promise<CalendarConnectionRecord>;
  listByUserId(userId: string): Promise<CalendarConnectionRecord[]>;
  findById(id: string): Promise<CalendarConnectionRecord | null>;
  updateById(
    id: string,
    patch: Partial<Omit<CalendarConnectionRecord, "id" | "userId">>,
  ): Promise<CalendarConnectionRecord | null>;
  replaceWithPending?(input: {
    previousId: string;
    userId: string;
    provider: CalendarProviderId;
    pending: CalendarConnectionRecord;
  }): Promise<CalendarConnectionRecord>;
  claimPending?(input: {
    id: string;
    userId: string;
    provider: CalendarProviderId;
  }): Promise<CalendarConnectionRecord | null>;
};

export const CALENDAR_OAUTH_STATE_LIFETIME_MS = 5 * 60 * 1000;
export const CALENDAR_OAUTH_RETURN_TO = "/me/calendar-connections";

export type CalendarOAuthState = {
  version: 1;
  provider: CalendarProviderId;
  connectionId: string;
  sessionId: string;
  csrfTokenHash: string;
  codeVerifier: string;
  issuedAt: string;
  expiresAt: string;
  returnTo: typeof CALENDAR_OAUTH_RETURN_TO;
};

const calendarOAuthStateSchema = z
  .object({
    version: z.literal(1),
    provider: z.enum(["google", "microsoft"]),
    connectionId: z.string().min(1),
    sessionId: z.string().min(1),
    csrfTokenHash: z.string().min(1),
    codeVerifier: z.string().min(1),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    returnTo: z.literal(CALENDAR_OAUTH_RETURN_TO),
  })
  .strict();

export function hashCalendarOAuthCsrfToken(csrfToken: string): string {
  return createHash("sha256").update(csrfToken).digest("base64url");
}

export async function unsealCalendarConnectionState({
  state,
  secret,
  now = systemClock().now(),
  maxLifetimeMs = CALENDAR_OAUTH_STATE_LIFETIME_MS,
}: {
  state: string;
  secret: string;
  now?: Date;
  maxLifetimeMs?: number;
}): Promise<CalendarOAuthState> {
  const payload = calendarOAuthStateSchema.parse(
    await Iron.unseal(state, secret, Iron.defaults),
  );
  const issuedAt = new Date(payload.issuedAt).getTime();
  const expiresAt = new Date(payload.expiresAt).getTime();
  const nowMs = now.getTime();

  if (expiresAt <= issuedAt || expiresAt - issuedAt > maxLifetimeMs) {
    throw new Error("Calendar OAuth state has an invalid lifetime.");
  }
  if (issuedAt > nowMs) {
    throw new Error("Calendar OAuth state is not valid yet.");
  }
  if (expiresAt <= nowMs) {
    throw new Error("Calendar OAuth state has expired.");
  }

  return payload;
}

export async function sealCalendarConnectionState({
  provider = "google",
  connectionId,
  sessionId = "session-1",
  csrfToken,
  csrfTokenHash,
  codeVerifier,
  issuedAt = systemClock().now(),
  expiresAt = new Date(issuedAt.getTime() + CALENDAR_OAUTH_STATE_LIFETIME_MS),
  returnTo = CALENDAR_OAUTH_RETURN_TO,
  secret,
}: {
  provider?: CalendarProviderId;
  connectionId: string;
  sessionId?: string;
  csrfToken?: string;
  csrfTokenHash?: string;
  codeVerifier: string;
  issuedAt?: Date;
  expiresAt?: Date;
  returnTo?: typeof CALENDAR_OAUTH_RETURN_TO;
  secret: string;
}): Promise<string> {
  const resolvedCsrfTokenHash =
    csrfTokenHash ??
    (csrfToken ? hashCalendarOAuthCsrfToken(csrfToken) : undefined);
  if (!resolvedCsrfTokenHash) {
    throw new Error("Calendar OAuth state requires a CSRF token hash.");
  }

  const payload: CalendarOAuthState = {
    version: 1,
    provider,
    connectionId,
    sessionId,
    csrfTokenHash: resolvedCsrfTokenHash,
    codeVerifier,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    returnTo,
  };

  return Iron.seal(payload, secret, Iron.defaults);
}

export function presentCalendarConnection({
  provider,
  connection,
}: {
  provider: CalendarProvider;
  connection: CalendarConnectionRecord;
}): CalendarConnectionView {
  if (connection.provider !== provider.id) {
    throw new Error("Calendar connection provider does not match.");
  }

  return {
    id: connection.id,
    provider: connection.provider,
    accountIdentifier: connection.accountIdentifier,
    providerAccountKey: connection.providerAccountKey,
    scopes: connection.scopes,
    status: connection.status,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    lastErrorCode: connection.lastErrorCode,
    lastErrorMessage: connection.lastErrorMessage,
    lastSyncAt: connection.lastSyncAt ?? null,
    contributingCalendarIds: connection.contributingCalendarIds,
  };
}

export async function revokeCalendarConnection({
  provider,
  repository,
  connectionId,
  fetchImpl,
  tokenEncryptionKey,
}: {
  provider: CalendarProvider;
  repository: CalendarConnectionRepository;
  connectionId: string;
  fetchImpl: typeof fetch;
  tokenEncryptionKey: string;
}): Promise<CalendarConnectionRecord> {
  const connection = await repository.findById(connectionId);
  if (!connection || connection.provider !== provider.id) {
    throw new Error("Calendar connection not found.");
  }

  if (connection.refreshTokenEncrypted) {
    await provider.revoke({
      refreshToken: decryptCalendarToken({
        ciphertext: connection.refreshTokenEncrypted,
        key: tokenEncryptionKey,
      }),
      fetchImpl,
    });
  }

  const updated = await repository.updateById(connectionId, {
    status: "disconnected",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
  });
  if (!updated) {
    throw new Error("Calendar connection could not be disconnected.");
  }

  return updated;
}

export type CompleteCalendarConnectionResult =
  | { status: "connected"; connection: CalendarConnectionRecord }
  | {
      status: "unsupported";
      connection: CalendarConnectionRecord;
      reason: string;
    };

export async function claimCalendarOAuthAttempt({
  repository,
  payload,
  userId,
}: {
  repository: CalendarConnectionRepository;
  payload: CalendarOAuthState;
  userId: string;
}): Promise<CalendarConnectionRecord> {
  const connection = await repository.findById(payload.connectionId);
  if (
    !connection ||
    connection.userId !== userId ||
    connection.provider !== payload.provider ||
    connection.status !== "pending"
  ) {
    throw new Error("Calendar OAuth attempt is not pending.");
  }

  const claimed = repository.claimPending
    ? await repository.claimPending({
        id: connection.id,
        userId,
        provider: payload.provider,
      })
    : ((await repository.updateById(connection.id, {
        status: "disconnected",
      })) ?? { ...connection, status: "disconnected" });
  if (!claimed) {
    throw new Error("Calendar OAuth attempt was already consumed.");
  }

  return claimed;
}

export async function completeClaimedCalendarConnection({
  provider,
  repository,
  connection,
  baseUrl,
  clientId,
  clientSecret,
  code,
  codeVerifier,
  fetchImpl,
  tokenEncryptionKey,
}: {
  provider: CalendarProvider;
  repository: CalendarConnectionRepository;
  connection: CalendarConnectionRecord;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  fetchImpl: typeof fetch;
  tokenEncryptionKey: string;
}): Promise<CompleteCalendarConnectionResult> {
  if (connection.provider !== provider.id) {
    throw new Error("Calendar connection provider does not match.");
  }

  const completion = await provider.completeAuthorization({
    baseUrl,
    clientId,
    clientSecret,
    code,
    codeVerifier,
    fetchImpl,
  });

  if (completion.kind === "unsupported") {
    const updated = await repository.updateById(connection.id, {
      status: "unsupported",
    });
    if (!updated) {
      throw new Error("Calendar connection could not be updated.");
    }
    return {
      status: "unsupported",
      connection: updated,
      reason: completion.reason,
    };
  }

  const accountIdentifier = `${provider.accountIdPrefix}:${connection.id}`;
  const updated = await repository.updateById(connection.id, {
    accountIdentifier,
    providerAccountKey: accountIdentifier,
    scopes: completion.scopes,
    status: "connected",
    accessTokenEncrypted: encryptCalendarToken({
      plaintext: completion.accessToken,
      key: tokenEncryptionKey,
    }),
    refreshTokenEncrypted: encryptCalendarToken({
      plaintext: completion.refreshToken,
      key: tokenEncryptionKey,
    }),
    accessTokenExpiresAt: completion.accessTokenExpiresAt,
    contributingCalendarIds: completion.contributingCalendarIds,
  });

  if (!updated) {
    throw new Error("Calendar connection could not be updated.");
  }

  return { status: "connected", connection: updated };
}

export async function completeCalendarConnection({
  provider,
  repository,
  baseUrl,
  clientId,
  clientSecret,
  code,
  fetchImpl,
  sessionSecret,
  state,
  tokenEncryptionKey,
  expectedUserId,
  now,
}: {
  provider: CalendarProvider;
  repository: CalendarConnectionRepository;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImpl: typeof fetch;
  sessionSecret: string;
  state: string;
  tokenEncryptionKey: string;
  expectedUserId?: string;
  now?: Date;
}): Promise<CompleteCalendarConnectionResult> {
  const payload = await unsealCalendarConnectionState({
    state,
    secret: sessionSecret,
    now,
  });
  const existing = await repository.findById(payload.connectionId);
  const connection = await claimCalendarOAuthAttempt({
    repository,
    payload,
    userId: expectedUserId ?? existing?.userId ?? "",
  });

  return completeClaimedCalendarConnection({
    provider,
    repository,
    connection,
    baseUrl,
    clientId,
    clientSecret,
    code,
    codeVerifier: payload.codeVerifier,
    fetchImpl,
    tokenEncryptionKey,
  });
}

export async function startCalendarConnection({
  provider,
  repository,
  baseUrl,
  clientId,
  csrfToken,
  sessionId = "session-1",
  clock = systemClock(),
  generateId = () => randomUUID(),
  sessionSecret,
  userId,
}: {
  provider: CalendarProvider;
  repository: CalendarConnectionRepository;
  baseUrl: string;
  clientId: string;
  csrfToken: string;
  sessionId?: string;
  clock?: { now(): Date };
  generateId?: () => string;
  sessionSecret: string;
  userId: string;
}): Promise<{
  authorizationUrl: string;
  connection: CalendarConnectionRecord;
  codeVerifier: string;
  state: string;
}> {
  const connectionId = generateId();
  const codeVerifier = randomBytes(32).toString("base64url");
  const accountIdentifier = `${provider.accountIdPrefix}:${connectionId}`;
  const connection = await repository.createPending({
    id: connectionId,
    userId,
    provider: provider.id,
    providerAccountKey: accountIdentifier,
    accountIdentifier,
    scopes: provider.authorizationScopes,
    status: "pending",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    contributingCalendarIds: [],
  });
  const issuedAt = clock.now();
  const state = await sealCalendarConnectionState({
    provider: provider.id,
    connectionId: connection.id,
    sessionId,
    csrfToken,
    codeVerifier,
    issuedAt,
    secret: sessionSecret,
  });

  return {
    authorizationUrl: provider.buildAuthorizationUrl({
      baseUrl,
      clientId,
      codeChallenge: createHash("sha256")
        .update(codeVerifier)
        .digest("base64url"),
      state,
    }),
    connection,
    codeVerifier,
    state,
  };
}
