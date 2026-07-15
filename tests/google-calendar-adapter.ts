export type OAuthCallback = {
  code: string;
  codeVerifier: string;
  scope: string;
  state: string;
};

export type OAuthDenialCallback = {
  error: "access_denied";
  errorDescription?: string;
  state: string;
};

export type DeniedConsentCallbackOptions = {
  baseUrl: string;
  errorDescription?: string;
  state: string;
};

export type FreeBusyQuery = {
  timeMin: Date;
  timeMax: Date;
  calendarIds: string[];
};

export type FreeBusyInterval = {
  start: Date;
  end: Date;
  status: "busy" | "out-of-office" | "tentative" | "free" | "working-elsewhere";
};

export type WebhookDelivery = {
  channelId: string;
  resourceId: string;
  resourceState: string;
};

export type MockGoogleCalendarAdapterOptions = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
};

export type MockGoogleCalendarAdapter = {
  oauthCallbacks: OAuthCallback[];
  denialCallbacks: OAuthDenialCallback[];
  freeBusyQueries: FreeBusyQuery[];
  webhookDeliveries: WebhookDelivery[];
  requestedScopes: string[];
  buildDeniedConsentCallbackRequest(
    options: DeniedConsentCallbackOptions,
  ): Request;
  getFetchImpl(): typeof fetch;
  getWebhookNotifier(): (req: Request) => Promise<void>;
  setFreeBusyResponse(calendarId: string, intervals: FreeBusyInterval[]): void;
  reset(): void;
};

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_FREEBUSY_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/freeBusy";

export function buildMockGoogleCalendarAdapter(
  options: MockGoogleCalendarAdapterOptions = {},
): MockGoogleCalendarAdapter {
  const accessToken = options.accessToken ?? "mock-access-token";
  const refreshToken = options.refreshToken ?? "mock-refresh-token";
  const expiresIn = options.expiresIn ?? 3600;

  const oauthCallbacks: OAuthCallback[] = [];
  const denialCallbacks: OAuthDenialCallback[] = [];
  const freeBusyQueries: FreeBusyQuery[] = [];
  const webhookDeliveries: WebhookDelivery[] = [];
  const requestedScopes = new Set<string>();
  const freeBusyResponses = new Map<string, FreeBusyInterval[]>();

  function buildDeniedConsentCallbackRequest({
    baseUrl,
    errorDescription,
    state,
  }: DeniedConsentCallbackOptions): Request {
    const body = new URLSearchParams({
      error: "access_denied",
      state,
    });
    if (errorDescription) {
      body.set("error_description", errorDescription);
    }

    const callback: OAuthDenialCallback = {
      error: "access_denied",
      state,
      ...(errorDescription ? { errorDescription } : {}),
    };
    denialCallbacks.push(callback);

    return new Request(new URL("/me/calendar-connections/callback", baseUrl), {
      method: "POST",
      body,
    });
  }

  function getFetchImpl(): typeof fetch {
    return (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url === GOOGLE_TOKEN_ENDPOINT) {
        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : "";

        const params = new URLSearchParams(bodyText);
        const callback: OAuthCallback = {
          code: params.get("code") ?? "",
          codeVerifier: params.get("code_verifier") ?? "",
          scope: params.get("scope") ?? "",
          state: params.get("state") ?? "",
        };
        oauthCallbacks.push(callback);
        if (callback.scope) {
          requestedScopes.add(callback.scope);
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: expiresIn,
              scope: "https://www.googleapis.com/auth/calendar.freebusy",
              token_type: "Bearer",
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }

      if (url === GOOGLE_FREEBUSY_ENDPOINT) {
        const body = JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as {
          timeMin?: string;
          timeMax?: string;
          items?: Array<{ id: string }>;
        };

        freeBusyQueries.push({
          timeMin: body.timeMin ? new Date(body.timeMin) : new Date(),
          timeMax: body.timeMax ? new Date(body.timeMax) : new Date(),
          calendarIds: body.items?.map((i) => i.id) ?? [],
        });

        const busyItems =
          body.items?.map((item) => {
            const intervals = freeBusyResponses.get(item.id) ?? [];
            return {
              id: item.id,
              busy: intervals
                .filter(
                  (i) => i.status === "busy" || i.status === "out-of-office",
                )
                .map((i) => ({
                  start: i.start.toISOString(),
                  end: i.end.toISOString(),
                })),
              outOfOffice: intervals
                .filter((i) => i.status === "out-of-office")
                .map((i) => ({
                  start: i.start.toISOString(),
                  end: i.end.toISOString(),
                })),
              tentative: intervals
                .filter(
                  (i) =>
                    i.status === "tentative" ||
                    i.status === "working-elsewhere",
                )
                .map((i) => ({
                  start: i.start.toISOString(),
                  end: i.end.toISOString(),
                })),
            };
          }) ?? [];

        return Promise.resolve(
          new Response(
            JSON.stringify({
              kind: "calendar#freeBusy",
              timeMin: body.timeMin,
              timeMax: body.timeMax,
              calendars: Object.fromEntries(
                busyItems.map((item) => [item.id, item]),
              ),
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      );
    };
  }

  function getWebhookNotifier(): (req: Request) => Promise<void> {
    return (req: Request): Promise<void> => {
      webhookDeliveries.push({
        channelId: req.headers.get("x-goog-channel-id") ?? "",
        resourceId: req.headers.get("x-goog-resource-id") ?? "",
        resourceState: req.headers.get("x-goog-resource-state") ?? "",
      });
      return Promise.resolve();
    };
  }

  function setFreeBusyResponse(
    calendarId: string,
    intervals: FreeBusyInterval[],
  ): void {
    freeBusyResponses.set(calendarId, intervals);
  }

  function reset(): void {
    oauthCallbacks.length = 0;
    denialCallbacks.length = 0;
    freeBusyQueries.length = 0;
    webhookDeliveries.length = 0;
    requestedScopes.clear();
    freeBusyResponses.clear();
  }

  return {
    get oauthCallbacks() {
      return oauthCallbacks;
    },
    get denialCallbacks() {
      return denialCallbacks;
    },
    get freeBusyQueries() {
      return freeBusyQueries;
    },
    get webhookDeliveries() {
      return webhookDeliveries;
    },
    get requestedScopes() {
      return Array.from(requestedScopes);
    },
    buildDeniedConsentCallbackRequest,
    getFetchImpl,
    getWebhookNotifier,
    setFreeBusyResponse,
    reset,
  };
}
