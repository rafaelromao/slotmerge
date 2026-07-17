import Iron from "@hapi/iron";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  CalendarConnectionStatus,
  CalendarProvider as CalendarProviderId,
} from "../db/schema";
import type { CalendarProvider } from "./provider";
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
};

type CalendarConnectionState = {
  connectionId: string;
  csrfToken: string;
  codeVerifier: string;
};

export async function unsealCalendarConnectionState({
  state,
  secret,
}: {
  state: string;
  secret: string;
}): Promise<CalendarConnectionState> {
  return (await Iron.unseal(
    state,
    secret,
    Iron.defaults,
  )) as CalendarConnectionState;
}

export async function sealCalendarConnectionState({
  connectionId,
  csrfToken,
  codeVerifier,
  secret,
}: CalendarConnectionState & { secret: string }): Promise<string> {
  return Iron.seal(
    { connectionId, csrfToken, codeVerifier },
    secret,
    Iron.defaults,
  );
}

export function presentCalendarConnection(
  connection: CalendarConnectionRecord,
): CalendarConnectionView {
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
}): Promise<CompleteCalendarConnectionResult> {
  const payload = await unsealCalendarConnectionState({
    state,
    secret: sessionSecret,
  });
  const connection = await repository.findById(payload.connectionId);

  if (!connection || connection.provider !== provider.id) {
    throw new Error("Calendar connection not found.");
  }
  if (connection.status !== "pending") {
    throw new Error("Calendar connection is not pending.");
  }

  const completion = await provider.completeAuthorization({
    baseUrl,
    clientId,
    clientSecret,
    code,
    codeVerifier: payload.codeVerifier,
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

export async function startCalendarConnection({
  provider,
  repository,
  baseUrl,
  clientId,
  csrfToken,
  generateId = () => randomUUID(),
  sessionSecret,
  userId,
}: {
  provider: CalendarProvider;
  repository: CalendarConnectionRepository;
  baseUrl: string;
  clientId: string;
  csrfToken: string;
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
  const state = await sealCalendarConnectionState({
    connectionId: connection.id,
    csrfToken,
    codeVerifier,
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
