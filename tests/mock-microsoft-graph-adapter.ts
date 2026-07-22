import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

const responses = require_("./provider-mock/responses.cjs") as {
  buildMicrosoftTokenResponse(
    scope: string,
    options?: {
      accountKind?: "work-school" | "personal";
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      scope?: string;
    },
  ): { status: number; body: Record<string, unknown> };
  buildMicrosoftCalendarsResponse(options?: {
    primaryCalendarId?: string;
  }): Record<string, unknown>;
  buildMicrosoftGetScheduleResponse(
    input: string | Record<string, unknown> | null,
    options?: {
      scheduleResponses?: Map<
        string,
        { availabilityView?: string; scheduleItems?: ScheduleItem[] }
      >;
    },
  ): Record<string, unknown>;
};

export type MicrosoftOAuthCallback = {
  code: string;
  codeVerifier: string;
  scope: string;
  state: string;
};

export type GetScheduleCall = {
  timeMin: Date;
  timeMax: Date;
  schedules: string[];
};

export type PrimaryCalendarCall = {
  accessToken: string;
};

export type WebhookDelivery = {
  subscriptionId: string;
  channelId: string;
  clientState: string;
  body: unknown;
};

export type ScheduleItem = {
  subject?: string;
  isBusy?: boolean;
  showAs?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export type MockMicrosoftGraphAdapterOptions = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  primaryCalendarId?: string;
};

export type MockMicrosoftGraphAdapter = {
  oauthCallbacks: MicrosoftOAuthCallback[];
  getScheduleCalls: GetScheduleCall[];
  primaryCalendarCalls: PrimaryCalendarCall[];
  webhookDeliveries: WebhookDelivery[];
  accountKind: "work-school" | "personal";
  getFetchImpl(): typeof fetch;
  getWebhookNotifier(): (req: Request) => Promise<void>;
  setScheduleResponse(
    calendarId: string,
    response: {
      availabilityView?: string;
      scheduleItems?: ScheduleItem[];
    },
  ): void;
  setAccountKind(kind: "work-school" | "personal"): void;
  reset(): void;
};

const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0";

export function buildMockMicrosoftGraphAdapter(
  options: MockMicrosoftGraphAdapterOptions = {},
): MockMicrosoftGraphAdapter {
  const accessToken = options.accessToken ?? "mock-access-token";
  const refreshToken = options.refreshToken ?? "mock-refresh-token";
  const expiresIn = options.expiresIn ?? 3600;
  const primaryCalendarId =
    options.primaryCalendarId ?? "mock-primary-calendar-id";

  const oauthCallbacks: MicrosoftOAuthCallback[] = [];
  const getScheduleCalls: GetScheduleCall[] = [];
  const primaryCalendarCalls: PrimaryCalendarCall[] = [];
  const webhookDeliveries: WebhookDelivery[] = [];
  const scheduleResponses = new Map<
    string,
    {
      availabilityView?: string;
      scheduleItems?: ScheduleItem[];
    }
  >();
  let accountKind: "work-school" | "personal" = "work-school";

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

      if (url === MICROSOFT_TOKEN_ENDPOINT) {
        const bodyText =
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof URLSearchParams
              ? init.body.toString()
              : "";

        const params = new URLSearchParams(bodyText);
        const callback: MicrosoftOAuthCallback = {
          code: params.get("code") ?? "",
          codeVerifier: params.get("code_verifier") ?? "",
          scope: params.get("scope") ?? "",
          state: params.get("state") ?? "",
        };
        oauthCallbacks.push(callback);

        const result = responses.buildMicrosoftTokenResponse(callback.scope, {
          accountKind,
          accessToken,
          refreshToken,
          expiresIn,
        });

        return Promise.resolve(
          new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      if (
        url ===
        `${MICROSOFT_GRAPH_ENDPOINT}/me/calendars?$filter=isPrimaryCalendar eq true&$top=1`
      ) {
        primaryCalendarCalls.push({ accessToken: "mock" });
        const payload = responses.buildMicrosoftCalendarsResponse({
          primaryCalendarId,
        });
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      if (url === `${MICROSOFT_GRAPH_ENDPOINT}/me/calendar/getSchedule`) {
        const body = JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as {
          schedules?: string[];
          startTime?: { dateTime: string; timeZone: string };
          endTime?: { dateTime: string; timeZone: string };
        };

        getScheduleCalls.push({
          timeMin: body.startTime?.dateTime
            ? new Date(body.startTime.dateTime)
            : new Date(),
          timeMax: body.endTime?.dateTime
            ? new Date(body.endTime.dateTime)
            : new Date(),
          schedules: body.schedules ?? [],
        });

        const payload = responses.buildMicrosoftGetScheduleResponse(body, {
          scheduleResponses,
        });

        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
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
    return async (req: Request): Promise<void> => {
      let body: unknown = null;
      try {
        body = await req.clone().json();
      } catch {
        // body is not JSON or unreadable
      }
      webhookDeliveries.push({
        subscriptionId: req.headers.get("x-ms-subscription-id") ?? "",
        channelId: req.headers.get("x-ms-channel-id") ?? "",
        clientState:
          (body as { clientState?: string } | null)?.clientState ?? "",
        body,
      });
    };
  }

  function setScheduleResponse(
    calendarId: string,
    response: { availabilityView?: string; scheduleItems?: ScheduleItem[] },
  ): void {
    scheduleResponses.set(calendarId, response);
  }

  function setAccountKind(kind: "work-school" | "personal"): void {
    accountKind = kind;
  }

  function reset(): void {
    oauthCallbacks.length = 0;
    getScheduleCalls.length = 0;
    primaryCalendarCalls.length = 0;
    webhookDeliveries.length = 0;
    scheduleResponses.clear();
    accountKind = "work-school";
  }

  return {
    get oauthCallbacks() {
      return oauthCallbacks;
    },
    get getScheduleCalls() {
      return getScheduleCalls;
    },
    get primaryCalendarCalls() {
      return primaryCalendarCalls;
    },
    get webhookDeliveries() {
      return webhookDeliveries;
    },
    get accountKind() {
      return accountKind;
    },
    getFetchImpl,
    getWebhookNotifier,
    setScheduleResponse,
    setAccountKind,
    reset,
  };
}
