import Iron from "@hapi/iron";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import type {
  CalendarConnectionStatus,
  CalendarProvider as CalendarProviderId,
} from "../db/schema";
import type { CalendarProvider } from "./provider";

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
