/**
 * Mock Microsoft Graph adapter for E2E tests.
 * Records all API calls and returns scripted getSchedule responses, OAuth callbacks,
 * and webhook deliveries.
 *
 * E2E coverage: PRD stories 24-34 → tests 28-32 (Microsoft portion)
 */

export type GetScheduleRequest = {
  schedules: string[];
  startTime: { dateTime: string; timeZone: string };
  endTime: { dateTime: string; timeZone: string };
  availabilityViewInterval?: number;
};

export type ScheduleItem = {
  status: "busy" | "free" | "tentative" | "oof" | "unknown";
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export type ScheduleResponse = {
  scheduleId: string;
  availabilityView: string;
  scheduleItems: ScheduleItem[];
};

export type GetScheduleResult = {
  value: ScheduleResponse[];
};

export type OAuthCallbackResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type WebhookDeliveryResult = {
  subscriptionId: string;
  expirationDateTime?: string;
};

export type RecordedMicrosoftGraphCall =
  | { type: "getSchedule"; request: GetScheduleRequest }
  | { type: "oauth_callback"; code: string; state: string }
  | { type: "webhook"; subscriptionId: string };

export class MockMicrosoftGraph {
  private static _record: RecordedMicrosoftGraphCall[] = [];
  private static _scheduleScripts: Map<string, GetScheduleResult[]> = new Map();
  private static _oauthCallbacks: Map<string, OAuthCallbackResult> = new Map();
  private static _webhookScripts: Map<string, WebhookDeliveryResult> =
    new Map();

  static reset(): void {
    this._record = [];
    this._scheduleScripts.clear();
    this._oauthCallbacks.clear();
    this._webhookScripts.clear();
  }

  /**
   * Script getSchedule responses for a given email address.
   * Each call for that email pops the next result in the array.
   */
  static scriptGetSchedule(email: string, results: GetScheduleResult[]): void {
    this._scheduleScripts.set(email, [...results]);
  }

  static scriptOAuthCallback(code: string, result: OAuthCallbackResult): void {
    this._oauthCallbacks.set(code, result);
  }

  static scriptWebhookDelivery(
    subscriptionId: string,
    result: WebhookDeliveryResult,
  ): void {
    this._webhookScripts.set(subscriptionId, result);
  }

  static handleGetScheduleRequest(request: GetScheduleRequest): {
    ok: boolean;
    result?: GetScheduleResult;
    status: number;
  } {
    const scheduleResults: ScheduleResponse[] = [];

    for (const email of request.schedules) {
      const scripted = this._scheduleScripts.get(email);
      if (scripted && scripted.length > 0) {
        const result = scripted.shift()!;
        scheduleResults.push(
          ...result.value.filter((s) => s.scheduleId === email),
        );
      } else {
        scheduleResults.push({
          scheduleId: email,
          availabilityView: "",
          scheduleItems: [],
        });
      }
    }

    const result: GetScheduleResult = { value: scheduleResults };
    this._record.push({ type: "getSchedule", request });

    return { ok: true, result, status: 200 };
  }

  static resolveOAuthCallback(code: string): OAuthCallbackResult | undefined {
    const result = this._oauthCallbacks.get(code);
    if (result) {
      this._record.push({ type: "oauth_callback", code, state: "" });
    }
    return result;
  }

  static resolveWebhookDelivery(
    subscriptionId: string,
  ): WebhookDeliveryResult | undefined {
    const result = this._webhookScripts.get(subscriptionId);
    if (result) {
      this._record.push({ type: "webhook", subscriptionId });
    }
    return result;
  }

  static get record(): readonly RecordedMicrosoftGraphCall[] {
    return this._record;
  }

  static get getScheduleCalls(): GetScheduleRequest[] {
    return this._record
      .filter(
        (c): c is { type: "getSchedule"; request: GetScheduleRequest } =>
          c.type === "getSchedule",
      )
      .map((c) => c.request);
  }

  static get oauthCallbacks(): Array<{ code: string; state: string }> {
    return this._record
      .filter(
        (c): c is { type: "oauth_callback"; code: string; state: string } =>
          c.type === "oauth_callback",
      )
      .map((c) => ({ code: c.code, state: c.state }));
  }

  static get webhookDeliveries(): Array<{ subscriptionId: string }> {
    return this._record
      .filter(
        (c): c is { type: "webhook"; subscriptionId: string } =>
          c.type === "webhook",
      )
      .map((c) => ({ subscriptionId: c.subscriptionId }));
  }
}
