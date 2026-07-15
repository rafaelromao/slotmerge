import Iron from "@hapi/iron";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  buildMicrosoftCalendarAuthorizationUrl,
  getMicrosoftCalendarScopes,
} from "./microsoft-oauth";
import { encryptCalendarToken, decryptCalendarToken } from "./token-encryption";

const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const MICROSOFT_LOGOUT_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/logout";
const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

export type MicrosoftCalendarConnectionStatus =
  | "pending"
  | "connected"
  | "disconnected"
  | "sync_delayed"
  | "needs_reconnect"
  | "unsupported";

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
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt?: Date | null;
  contributingCalendarIds: string[];
};

export type MicrosoftCalendarConnectionView = {
  id: string;
  provider: "microsoft";
  accountIdentifier: string | null;
  providerAccountKey: string | null;
  scopes: string | null;
  status: MicrosoftCalendarConnectionStatus;
  accessTokenExpiresAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastSyncAt: Date | null;
  contributingCalendarIds: string[];
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
    lastErrorCode: null,
    lastErrorMessage: null,
    contributingCalendarIds: [],
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

export async function completeMicrosoftCalendarConnection({
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
  repository: MicrosoftCalendarConnectionRepository;
  sessionSecret: string;
  state: string;
  tokenEncryptionKey: string;
}): Promise<MicrosoftCalendarConnectionRecord> {
  const payload = (await Iron.unseal(
    state,
    sessionSecret,
    Iron.defaults,
  )) as MicrosoftCalendarConnectionState;

  const connection = await repository.findById(payload.connectionId);
  if (!connection) {
    throw new Error("Microsoft calendar connection not found.");
  }

  if (connection.status !== "pending") {
    throw new Error("Microsoft calendar connection is not pending.");
  }

  const tokenResponse = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: payload.codeVerifier,
      grant_type: "authorization_code",
      scope: getMicrosoftCalendarScopes(),
      redirect_uri: new URL(
        "/me/calendar-connections/callback",
        baseUrl,
      ).toString(),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error("Microsoft token exchange failed.");
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  if (!tokenPayload.access_token || !tokenPayload.refresh_token) {
    throw new Error("Microsoft token response did not include tokens.");
  }

  const primaryCalendarId = await getMicrosoftPrimaryCalendarId(
    tokenPayload.access_token,
    fetchImpl,
  );

  if (!primaryCalendarId) {
    throw new Error(
      "Could not determine the primary calendar for the Microsoft account. Please try again.",
    );
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
    accountIdentifier: `microsoft:${connection.id}`,
    providerAccountKey: `microsoft:${connection.id}`,
    scopes: tokenPayload.scope ?? getMicrosoftCalendarScopes(),
    status: "connected",
    accessTokenEncrypted,
    refreshTokenEncrypted,
    accessTokenExpiresAt: tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000)
      : null,
    contributingCalendarIds: [primaryCalendarId],
  });

  if (!updated) {
    throw new Error("Microsoft calendar connection could not be updated.");
  }

  return updated;
}

export async function revokeMicrosoftCalendarConnection({
  connectionId,
  fetchImpl,
  repository,
  tokenEncryptionKey,
}: {
  connectionId: string;
  fetchImpl: typeof fetch;
  repository: MicrosoftCalendarConnectionRepository;
  tokenEncryptionKey: string;
}): Promise<MicrosoftCalendarConnectionRecord> {
  const connection = await repository.findById(connectionId);

  if (!connection) {
    throw new Error("Microsoft calendar connection not found.");
  }

  const tokenCiphertext = connection.refreshTokenEncrypted;
  if (tokenCiphertext) {
    await bestEffortMicrosoftLogout({
      fetchImpl,
      refreshToken: decryptCalendarToken({
        ciphertext: tokenCiphertext,
        key: tokenEncryptionKey,
      }),
    });
  }

  const updated = await repository.updateById(connectionId, {
    status: "disconnected",
    refreshTokenEncrypted: null,
    accessTokenEncrypted: null,
    accessTokenExpiresAt: null,
  });

  if (!updated) {
    throw new Error("Microsoft calendar connection could not be disconnected.");
  }

  return updated;
}

async function bestEffortMicrosoftLogout({
  fetchImpl,
  refreshToken,
}: {
  fetchImpl: typeof fetch;
  refreshToken: string;
}): Promise<void> {
  try {
    await fetchImpl(MICROSOFT_LOGOUT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    // Microsoft identity platform does not expose a true refresh-token
    // revocation endpoint. The logout endpoint is best-effort; we still
    // null out the encrypted columns locally so the token cannot be reused.
  }
}

async function getMicrosoftPrimaryCalendarId(
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(
      `${MICROSOFT_GRAPH_ENDPOINT}/me/calendars?$filter=isPrimaryCalendar eq true&$top=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      value?: Array<{ id: string; isPrimaryCalendar?: boolean }>;
    };

    const primaryCalendar = data.value?.find(
      (cal) => cal.isPrimaryCalendar === true,
    );
    return primaryCalendar?.id ?? null;
  } catch {
    return null;
  }
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
    lastErrorCode: connection.lastErrorCode,
    lastErrorMessage: connection.lastErrorMessage,
    lastSyncAt: connection.lastSyncAt ?? null,
    contributingCalendarIds: connection.contributingCalendarIds,
  };
}
