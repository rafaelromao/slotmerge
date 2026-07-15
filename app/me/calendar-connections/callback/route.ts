import Iron from "@hapi/iron";

import { getSessionSecret } from "../../../../src/auth/session";
import {
  completeGoogleCalendarConnection,
  presentGoogleCalendarConnection,
} from "../../../../src/calendar/google-calendar-connections";
import {
  completeMicrosoftCalendarConnection,
  presentMicrosoftCalendarConnection,
} from "../../../../src/calendar/microsoft-calendar-connections";
import {
  findCalendarConnectionById,
  getGoogleCalendarConnectionRepository,
  getMicrosoftCalendarConnectionRepository,
} from "../../../../src/calendar/repository";

type CallbackState = {
  connectionId: string;
  csrfToken: string;
  codeVerifier: string;
};

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const error = formData.get("error");
  const code = formData.get("code");
  const state = formData.get("state");

  if (typeof error === "string" && error) {
    if (await isMicrosoftProvider(state)) {
      return Response.json(
        { error: "unsupported_microsoft_account" },
        { status: 400 },
      );
    }

    return Response.json({ error: "oauth_denied" }, { status: 400 });
  }

  if (typeof code !== "string" || typeof state !== "string") {
    return Response.json({ error: "invalid_oauth_callback" }, { status: 400 });
  }

  if (await isMicrosoftProvider(state)) {
    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
    const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

    if (!clientId || !clientSecret || !tokenEncryptionKey) {
      return Response.json(
        { error: "microsoft_oauth_not_configured" },
        { status: 500 },
      );
    }

    try {
      const connection = await completeMicrosoftCalendarConnection({
        baseUrl: new URL(request.url).origin,
        clientId,
        clientSecret,
        code,
        fetchImpl: fetch,
        repository: getMicrosoftCalendarConnectionRepository(),
        sessionSecret: getSessionSecret(),
        state,
        tokenEncryptionKey,
      });

      return Response.json({
        connection: presentMicrosoftCalendarConnection(connection),
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "unsupported_microsoft_account"
      ) {
        return Response.json(
          { error: "unsupported_microsoft_account" },
          { status: 400 },
        );
      }
      throw err;
    }
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

  if (!clientId || !clientSecret || !tokenEncryptionKey) {
    return Response.json(
      { error: "google_oauth_not_configured" },
      { status: 500 },
    );
  }

  const connection = await completeGoogleCalendarConnection({
    baseUrl: new URL(request.url).origin,
    clientId,
    clientSecret,
    code,
    fetchImpl: fetch,
    repository: getGoogleCalendarConnectionRepository(),
    sessionSecret: getSessionSecret(),
    state,
    tokenEncryptionKey,
  });

  return Response.json({
    connection: presentGoogleCalendarConnection(connection),
  });
}

async function isMicrosoftProvider(
  state: FormDataEntryValue | null,
): Promise<boolean> {
  if (typeof state !== "string" || !state) {
    return false;
  }

  let payload: CallbackState;
  try {
    payload = (await Iron.unseal(
      state,
      getSessionSecret(),
      Iron.defaults,
    )) as CallbackState;
  } catch {
    return false;
  }

  if (!payload.connectionId) {
    return false;
  }

  const found = await findCalendarConnectionById(payload.connectionId);
  return found?.provider === "microsoft";
}
