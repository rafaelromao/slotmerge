import Iron from "@hapi/iron";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  buildMicrosoftCalendarAuthorizationUrl,
  getMicrosoftCalendarScopes,
} from "./microsoft-oauth";

export type MicrosoftCalendarConnectionStatus =
  | "pending"
  | "connected"
  | "disconnected";

export type MicrosoftCalendarConnectionRecord = {
  id: string;
  userId: string;
  provider: "microsoft";
  providerAccountKey: string | null;
  accountIdentifier: string | null;
  scopes: string | null;
  status: MicrosoftCalendarConnectionStatus;
  refreshTokenEncrypted: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
};

export type MicrosoftCalendarConnectionView = {
  id: string;
  provider: "microsoft";
  accountIdentifier: string | null;
  providerAccountKey: string | null;
  scopes: string | null;
  status: MicrosoftCalendarConnectionStatus;
  accessTokenExpiresAt: Date | null;
};

export type MicrosoftCalendarConnectionRepository = {
  createPending(
    record: MicrosoftCalendarConnectionRecord,
  ): Promise<MicrosoftCalendarConnectionRecord>;
  listByUserId(userId: string): Promise<MicrosoftCalendarConnectionRecord[]>;
  findById(id: string): Promise<MicrosoftCalendarConnectionRecord | null>;
  updateById(
    id: string,
    patch: Partial<Omit<MicrosoftCalendarConnectionRecord, "id" | "userId">>,
  ): Promise<MicrosoftCalendarConnectionRecord | null>;
};

type MicrosoftCalendarConnectionState = {
  connectionId: string;
  csrfToken: string;
  codeVerifier: string;
};

export async function sealMicrosoftCalendarConnectionState({
  connectionId,
  csrfToken,
  codeVerifier,
  secret,
}: MicrosoftCalendarConnectionState & { secret: string }): Promise<string> {
  return Iron.seal(
    { connectionId, csrfToken, codeVerifier },
    secret,
    Iron.defaults,
  );
}

export async function startMicrosoftCalendarConnection({
  baseUrl,
  clientId,
  csrfToken,
  generateId = () => randomUUID(),
  repository,
  sessionSecret,
  userId,
}: {
  baseUrl: string;
  clientId: string;
  csrfToken: string;
  generateId?: () => string;
  repository: MicrosoftCalendarConnectionRepository;
  sessionSecret: string;
  userId: string;
}): Promise<{
  authorizationUrl: string;
  connection: MicrosoftCalendarConnectionRecord;
  codeVerifier: string;
  state: string;
}> {
  const connectionId = generateId();
  const codeVerifier = generatePkceVerifier();
  const connection = await repository.createPending({
    id: connectionId,
    userId,
    provider: "microsoft",
    providerAccountKey: `microsoft:${connectionId}`,
    accountIdentifier: `microsoft:${connectionId}`,
    scopes: getMicrosoftCalendarScopes(),
    status: "pending",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
  });
  const state = await sealMicrosoftCalendarConnectionState({
    connectionId: connection.id,
    csrfToken,
    codeVerifier,
    secret: sessionSecret,
  });

  return {
    authorizationUrl: buildMicrosoftCalendarAuthorizationUrl({
      baseUrl,
      clientId,
      codeChallenge: generatePkceChallenge(codeVerifier),
      state,
    }),
    connection,
    codeVerifier,
    state,
  };
}

function generatePkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generatePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function presentMicrosoftCalendarConnection(
  connection: MicrosoftCalendarConnectionRecord,
): MicrosoftCalendarConnectionView {
  return {
    id: connection.id,
    provider: connection.provider,
    accountIdentifier: connection.accountIdentifier,
    providerAccountKey: connection.providerAccountKey,
    scopes: connection.scopes,
    status: connection.status,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
  };
}
