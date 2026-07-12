import Iron from "@hapi/iron";

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
