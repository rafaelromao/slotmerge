import { getSessionSecret } from "../../../../src/auth/session";
import {
  completeCalendarConnection,
  presentCalendarConnection,
  unsealCalendarConnectionState,
} from "../../../../src/calendar/connection";
import { getCalendarProvider } from "../../../../src/calendar/providers";
import { getCalendarConnectionRepository } from "../../../../src/calendar/repository";
import type { CalendarProvider as CalendarProviderId } from "../../../../src/db/schema";

type OAuthConfiguration = {
  clientId: string | undefined;
  clientSecret: string | undefined;
  missingError: string;
};

type OAuthDeniedOutcome = {
  error: string;
  status?: "unsupported";
};

const deniedOutcomes: Record<CalendarProviderId, OAuthDeniedOutcome> = {
  google: { error: "oauth_denied" },
  microsoft: {
    error: "unsupported_microsoft_account",
    status: "unsupported",
  },
};

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const error = formData.get("error");
  const code = formData.get("code");
  const state = formData.get("state");
  const repository = getCalendarConnectionRepository();

  if (typeof error === "string" && error) {
    const connection = await findConnectionFromState(state);
    const outcome = connection
      ? deniedOutcomes[connection.provider]
      : { error: "oauth_denied" };
    if (connection && outcome.status) {
      await repository.updateById(connection.id, { status: outcome.status });
    }
    return Response.json({ error: outcome.error }, { status: 400 });
  }

  if (typeof code !== "string" || typeof state !== "string") {
    return Response.json({ error: "invalid_oauth_callback" }, { status: 400 });
  }

  const payload = await unsealCalendarConnectionState({
    state,
    secret: getSessionSecret(),
  });
  const connection = await repository.findById(payload.connectionId);
  if (!connection) {
    throw new Error("Calendar connection not found.");
  }

  const provider = getCalendarProvider(connection.provider);
  const configuration = getOAuthConfiguration(provider.id);
  const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;

  if (
    !configuration.clientId ||
    !configuration.clientSecret ||
    !tokenEncryptionKey
  ) {
    return Response.json(
      { error: configuration.missingError },
      { status: 500 },
    );
  }

  const result = await completeCalendarConnection({
    provider,
    repository,
    baseUrl: new URL(request.url).origin,
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    code,
    fetchImpl: fetch,
    sessionSecret: getSessionSecret(),
    state,
    tokenEncryptionKey,
  });

  if (result.status === "unsupported") {
    return Response.json({ error: result.reason }, { status: 400 });
  }

  return Response.json({
    connection: presentCalendarConnection(result.connection),
  });
}

async function findConnectionFromState(state: FormDataEntryValue | null) {
  if (typeof state !== "string" || !state) return null;

  try {
    const payload = await unsealCalendarConnectionState({
      state,
      secret: getSessionSecret(),
    });
    return getCalendarConnectionRepository().findById(payload.connectionId);
  } catch {
    return null;
  }
}

function getOAuthConfiguration(
  provider: CalendarProviderId,
): OAuthConfiguration {
  return {
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      missingError: "google_oauth_not_configured",
    },
    microsoft: {
      clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      missingError: "microsoft_oauth_not_configured",
    },
  }[provider];
}
