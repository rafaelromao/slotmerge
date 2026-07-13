import Iron from "@hapi/iron";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  buildGoogleCalendarAuthorizationUrl,
  getGoogleFreeBusyScope,
} from "./google-oauth";
import { decryptCalendarToken, encryptCalendarToken } from "./token-encryption";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type GoogleCalendarConnectionStatus =
  | "pending"
  | "connected"
  | "disconnected"
  | "sync_delayed"
  | "needs_reconnect"
  | "unsupported";

export type GoogleCalendarConnectionRecord = {
  id: string;
  userId: string;
  provider: "google";
  providerAccountKey: string | null;
  accountIdentifier: string | null;
  scopes: string | null;
  status: GoogleCalendarConnectionStatus;
  refreshTokenEncrypted: string | null;
  accessTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt?: Date | null;
  contributingCalendarIds: string[];
};

export type GoogleCalendarConnectionView = {
  id: string;
  provider: "google";
  accountIdentifier: string | null;
  providerAccountKey: string | null;
  scopes: string | null;
  status: GoogleCalendarConnectionStatus;
  accessTokenExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt: Date | null;
  contributingCalendarIds: string[];
};

export type GoogleCalendarConnectionRepository = {
  createPending(
    record: GoogleCalendarConnectionRecord,
  ): Promise<GoogleCalendarConnectionRecord>;
  listByUserId(userId: string): Promise<GoogleCalendarConnectionRecord[]>;
  findById(id: string): Promise<GoogleCalendarConnectionRecord | null>;
  updateById(
    id: string,
    patch: Partial<Omit<GoogleCalendarConnectionRecord, "id" | "userId">>,
  ): Promise<GoogleCalendarConnectionRecord | null>;
};

type GoogleCalendarConnectionState = {
  connectionId: string;
  csrfToken: string;
  codeVerifier: string;
};

export async function sealGoogleCalendarConnectionState({
  connectionId,
  csrfToken,
  codeVerifier,
  secret,
}: GoogleCalendarConnectionState & { secret: string }): Promise<string> {
  return Iron.seal(
    { connectionId, csrfToken, codeVerifier },
    secret,
    Iron.defaults,
  );
}

export async function startGoogleCalendarConnection({
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
  repository: GoogleCalendarConnectionRepository;
  sessionSecret: string;
  userId: string;
}): Promise<{
  authorizationUrl: string;
  connection: GoogleCalendarConnectionRecord;
  codeVerifier: string;
  state: string;
}> {
  const connectionId = generateId();
  const codeVerifier = generatePkceVerifier();
  const connection = await repository.createPending({
    id: connectionId,
    userId,
    provider: "google",
    providerAccountKey: `google:${connectionId}`,
    accountIdentifier: `google:${connectionId}`,
    scopes: getGoogleFreeBusyScope(),
    status: "pending",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    contributingCalendarIds: [],
  });
  const state = await sealGoogleCalendarConnectionState({
    connectionId: connection.id,
    csrfToken,
    codeVerifier,
    secret: sessionSecret,
  });

  return {
    authorizationUrl: buildGoogleCalendarConnectRequest({
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

export async function completeGoogleCalendarConnection({
  baseUrl,
  clientId,
  clientSecret,
  code,
  fetchImpl,
  repository,
  sessionSecret,
  state,
  tokenEncryptionKey,
}: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImpl: typeof fetch;
  repository: GoogleCalendarConnectionRepository;
  sessionSecret: string;
  state: string;
  tokenEncryptionKey: string;
}): Promise<GoogleCalendarConnectionRecord> {
  const payload = (await Iron.unseal(
    state,
    sessionSecret,
    Iron.defaults,
  )) as GoogleCalendarConnectionState;

  const connection = await repository.findById(payload.connectionId);
  if (!connection) {
    throw new Error("Google calendar connection not found.");
  }

  if (connection.status !== "pending") {
    throw new Error("Google calendar connection is not pending.");
  }

  const tokenResponse = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: payload.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: new URL(
        "/me/calendar-connections/callback",
        baseUrl,
      ).toString(),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Google token exchange failed.");
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  if (!tokenPayload.access_token || !tokenPayload.refresh_token) {
    throw new Error("Google token response did not include tokens.");
  }

  const accessTokenEncrypted = encryptCalendarToken({
    plaintext: tokenPayload.access_token,
    key: tokenEncryptionKey,
  });
  const refreshTokenEncrypted = encryptCalendarToken({
    plaintext: tokenPayload.refresh_token,
    key: tokenEncryptionKey,
  });

  const updated = await repository.updateById(connection.id, {
    accountIdentifier: `google:${connection.id}`,
    providerAccountKey: `google:${connection.id}`,
    scopes: tokenPayload.scope ?? getGoogleFreeBusyScope(),
    status: "connected",
    accessTokenEncrypted,
    refreshTokenEncrypted,
    accessTokenExpiresAt: tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000)
      : null,
    contributingCalendarIds: ["primary"],
  });

  if (!updated) {
    throw new Error("Google calendar connection could not be updated.");
  }

  return updated;
}

export async function revokeGoogleCalendarConnection({
  connectionId,
  fetchImpl,
  repository,
  tokenEncryptionKey,
}: {
  connectionId: string;
  fetchImpl: typeof fetch;
  repository: GoogleCalendarConnectionRepository;
  tokenEncryptionKey: string;
}): Promise<GoogleCalendarConnectionRecord> {
  const connection = await repository.findById(connectionId);

  if (!connection) {
    throw new Error("Google calendar connection not found.");
  }

  const tokenCiphertext = connection.refreshTokenEncrypted;
  if (tokenCiphertext) {
    const tokenResponse = await fetchImpl(
      "https://oauth2.googleapis.com/revoke",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: decryptCalendarToken({
            ciphertext: tokenCiphertext,
            key: tokenEncryptionKey,
          }),
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new Error("Google token revocation failed.");
    }
  }

  const updated = await repository.updateById(connectionId, {
    status: "disconnected",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
  });

  if (!updated) {
    throw new Error("Google calendar connection could not be disconnected.");
  }

  return updated;
}

export function buildGoogleCalendarConnectRequest({
  baseUrl,
  clientId,
  codeChallenge,
  state,
}: {
  baseUrl: string;
  clientId: string;
  codeChallenge: string;
  state: string;
}): string {
  return buildGoogleCalendarAuthorizationUrl({
    baseUrl,
    clientId,
    codeChallenge,
    state,
  });
}

function generatePkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generatePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function presentGoogleCalendarConnection(
  connection: GoogleCalendarConnectionRecord,
): GoogleCalendarConnectionView {
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
