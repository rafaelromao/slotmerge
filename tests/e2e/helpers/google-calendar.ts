/**
 * Mock Google Calendar adapter for E2E tests.
 * Records all API calls and returns scripted free/busy responses, OAuth callbacks,
 * and webhook deliveries.
 *
 * E2E coverage: PRD stories 24-34 → tests 21-32 (Google portion)
 */

export type FreeBusyQuery = {
  timeMin: string;
  timeMax: string;
  timeZone: string;
  items: Array<{ id: string }>;
};

export type FreeBusyResponse = {
  calendars: Record<
    string,
    {
      busy: Array<{ start: string; end: string }>;
      errors?: Array<{ domain: string; reason: string }>;
    }
  >;
};

export type OAuthCallbackResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email?: string;
};

export type WebhookDeliveryResult = {
  channelId: string;
  resourceId?: string;
  expiration?: string;
};

export type RecordedGoogleCalendarCall =
  | { type: "freebusy"; query: FreeBusyQuery; response: FreeBusyResponse }
  | { type: "oauth_callback"; code: string; state: string }
  | { type: "webhook"; channelId: string; resourceUri?: string };

export class MockGoogleCalendar {
  private static _record: RecordedGoogleCalendarCall[] = [];
  private static _freebusyScripts: Map<string, FreeBusyResponse[]> = new Map();
  private static _oauthCallbacks: Map<string, OAuthCallbackResult> = new Map();
  private static _webhookScripts: Map<string, WebhookDeliveryResult> =
    new Map();

  static reset(): void {
    this._record = [];
    this._freebusyScripts.clear();
    this._oauthCallbacks.clear();
    this._webhookScripts.clear();
  }

  /**
   * Script free/busy responses for a given email address.
   * Each call for that email pops the next response in the array.
   */
  static scriptFreeBusy(email: string, responses: FreeBusyResponse[]): void {
    this._freebusyScripts.set(email, [...responses]);
  }

  /**
   * Script the result of an OAuth callback exchange (code+state → tokens).
   * The code is used as the key to retrieve the scripted result.
   */
  static scriptOAuthCallback(code: string, result: OAuthCallbackResult): void {
    this._oauthCallbacks.set(code, result);
  }

  /**
   * Script the result of a webhook delivery.
   * The channelId is used as the key.
   */
  static scriptWebhookDelivery(
    channelId: string,
    result: WebhookDeliveryResult,
  ): void {
    this._webhookScripts.set(channelId, result);
  }

  /**
   * Call this to record a freebusy query and return a scripted response.
   * Returns a Response object shaped like the Google Calendar API.
   */
  static handleFreeBusyRequest(requestBody: FreeBusyQuery): {
    ok: boolean;
    response?: FreeBusyResponse;
    status: number;
  } {
    const items = requestBody.items ?? [];
    const responses: FreeBusyResponse["calendars"] = {};
    let hasData = false;

    for (const item of items) {
      const email = item.id;
      const scripted = this._freebusyScripts.get(email);
      if (scripted && scripted.length > 0) {
        const response = scripted.shift()!;
        responses[email] = response.calendars[email] ?? { busy: [] };
        if (responses[email].busy.length > 0) hasData = true;
      } else {
        responses[email] = { busy: [] };
      }
    }

    const result: FreeBusyResponse = { calendars: responses };
    this._record.push({
      type: "freebusy",
      query: requestBody,
      response: result,
    });

    return {
      ok: hasData || items.length === 0,
      response: result,
      status: 200,
    };
  }

  /**
   * Resolve a scripted OAuth callback.
   * Returns undefined if no script is registered for this code.
   */
  static resolveOAuthCallback(code: string): OAuthCallbackResult | undefined {
    const result = this._oauthCallbacks.get(code);
    if (result) {
      this._record.push({ type: "oauth_callback", code, state: "" });
    }
    return result;
  }

  /**
   * Resolve a scripted webhook delivery.
   * Returns undefined if no script is registered for this channelId.
   */
  static resolveWebhookDelivery(
    channelId: string,
  ): WebhookDeliveryResult | undefined {
    const result = this._webhookScripts.get(channelId);
    if (result) {
      this._record.push({
        type: "webhook",
        channelId,
        resourceUri: result.resourceId,
      });
    }
    return result;
  }

  static get record(): readonly RecordedGoogleCalendarCall[] {
    return this._record;
  }

  static get freeBusyCalls(): FreeBusyQuery[] {
    return this._record
      .filter(
        (
          c,
        ): c is {
          type: "freebusy";
          query: FreeBusyQuery;
          response: FreeBusyResponse;
        } => c.type === "freebusy",
      )
      .map((c) => c.query);
  }

  static get oauthCallbacks(): Array<{ code: string; state: string }> {
    return this._record
      .filter(
        (c): c is { type: "oauth_callback"; code: string; state: string } =>
          c.type === "oauth_callback",
      )
      .map((c) => ({ code: c.code, state: c.state }));
  }

  static get webhookDeliveries(): Array<{
    channelId: string;
    resourceUri?: string;
  }> {
    return this._record
      .filter(
        (
          c,
        ): c is { type: "webhook"; channelId: string; resourceUri?: string } =>
          c.type === "webhook",
      )
      .map((c) => ({ channelId: c.channelId, resourceUri: c.resourceUri }));
  }
}
