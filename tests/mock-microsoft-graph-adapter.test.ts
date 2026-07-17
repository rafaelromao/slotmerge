import { describe, expect, it } from "vitest";
import { buildMockMicrosoftGraphAdapter } from "./mock-microsoft-graph-adapter";

const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

describe("MockMicrosoftGraphAdapter", () => {
  describe("Slice 1: OAuth token exchange recording", () => {
    it("records OAuth token exchange calls with code and codeVerifier", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();
      expect(adapter.oauthCallbacks).toHaveLength(0);

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "microsoft-client-id",
          client_secret: "microsoft-client-secret",
          code: "auth-code-123",
          code_verifier: "code-verifier-1",
          grant_type: "authorization_code",
          redirect_uri:
            "https://slotmerge.example/me/calendar-connections/callback",
        }),
      });

      expect(adapter.oauthCallbacks).toHaveLength(1);
      expect(adapter.oauthCallbacks[0].code).toBe("auth-code-123");
      expect(adapter.oauthCallbacks[0].codeVerifier).toBe("code-verifier-1");
    });

    it("returns scripted tokens on OAuth callback", async () => {
      const adapter = buildMockMicrosoftGraphAdapter({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresIn: 3600,
      });

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
        method: "POST",
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        scope: string;
      };
      expect(body.access_token).toBe("mock-access-token");
      expect(body.refresh_token).toBe("mock-refresh-token");
      expect(body.expires_in).toBe(3600);
      expect(body.scope).toBe("offline_access Calendars.ReadBasic");
    });

    it("records scope and state from token exchange", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
        method: "POST",
        body: new URLSearchParams({
          code: "auth-code-1",
          code_verifier: "verifier-1",
          scope: "offline_access Calendars.ReadBasic",
          state: "state-1",
        }),
      });

      expect(adapter.oauthCallbacks).toHaveLength(1);
      expect(adapter.oauthCallbacks[0].scope).toBe(
        "offline_access Calendars.ReadBasic",
      );
      expect(adapter.oauthCallbacks[0].state).toBe("state-1");
    });
  });

  describe("Slice 2: Primary calendar ID query recording", () => {
    it("records primary calendar query calls", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl(
        "https://graph.microsoft.com/v1.0/me/calendars?$filter=isPrimaryCalendar eq true&$top=1",
        {
          method: "GET",
          headers: { Authorization: "Bearer mock-access-token" },
        },
      );

      expect(adapter.primaryCalendarCalls).toHaveLength(1);
    });

    it("returns scripted primary calendar ID", async () => {
      const adapter = buildMockMicrosoftGraphAdapter({
        primaryCalendarId: "primary-calendar-id",
      });

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(
        "https://graph.microsoft.com/v1.0/me/calendars?$filter=isPrimaryCalendar eq true&$top=1",
        {
          method: "GET",
          headers: { Authorization: "Bearer mock-access-token" },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        value: Array<{ id: string; isPrimaryCalendar?: boolean }>;
      };
      expect(body.value[0].id).toBe("primary-calendar-id");
      expect(body.value[0].isPrimaryCalendar).toBe(true);
    });
  });

  describe("Slice 3: getSchedule call recording", () => {
    it("records getSchedule calls with time range and calendar IDs", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();

      const fetchImpl = adapter.getFetchImpl();
      const timeMin = "2026-07-01T00:00:00Z";
      const timeMax = "2026-07-07T00:00:00Z";
      await fetchImpl(
        "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer mock-access-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schedules: ["primary", "work@example.com"],
            startTime: { dateTime: timeMin, timeZone: "UTC" },
            endTime: { dateTime: timeMax, timeZone: "UTC" },
          }),
        },
      );

      expect(adapter.getScheduleCalls).toHaveLength(1);
      expect(adapter.getScheduleCalls[0].timeMin.getTime()).toBe(
        new Date(timeMin).getTime(),
      );
      expect(adapter.getScheduleCalls[0].timeMax.getTime()).toBe(
        new Date(timeMax).getTime(),
      );
      expect(adapter.getScheduleCalls[0].schedules).toEqual([
        "primary",
        "work@example.com",
      ]);
    });
  });

  describe("Slice 4: Scripted availability responses", () => {
    it("returns configured availabilityView and scheduleItems in getSchedule response", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();
      const busyStart = { dateTime: "2026-07-02T10:00:00Z", timeZone: "UTC" };
      const busyEnd = { dateTime: "2026-07-02T11:00:00Z", timeZone: "UTC" };

      adapter.setScheduleResponse("primary", {
        availabilityView: "2",
        scheduleItems: [
          {
            subject: "Team standup",
            isBusy: true,
            showAs: "busy",
            start: busyStart,
            end: busyEnd,
          },
        ],
      });

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(
        "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer mock-access-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schedules: ["primary"],
            startTime: { dateTime: "2026-07-01T00:00:00Z", timeZone: "UTC" },
            endTime: { dateTime: "2026-07-07T00:00:00Z", timeZone: "UTC" },
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        value: Array<{
          scheduleId: string;
          availabilityView?: string;
          calendarEvents?: Array<{
            subject?: string;
            isBusy?: boolean;
            showAs?: string;
            start: { dateTime: string; timeZone: string };
            end: { dateTime: string; timeZone: string };
          }>;
        }>;
      };
      expect(body.value).toHaveLength(1);
      expect(body.value[0].scheduleId).toBe("primary");
      expect(body.value[0].availabilityView).toBe("2");
      expect(body.value[0].calendarEvents).toHaveLength(1);
      expect(body.value[0].calendarEvents![0].subject).toBe("Team standup");
      expect(body.value[0].calendarEvents![0].isBusy).toBe(true);
      expect(body.value[0].calendarEvents![0].showAs).toBe("busy");
    });

    it("returns out-of-office and tentative intervals", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();
      adapter.setScheduleResponse("primary", {
        availabilityView: "3",
        scheduleItems: [
          {
            subject: "Out of office",
            isBusy: true,
            showAs: "oof",
            start: { dateTime: "2026-07-03T09:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2026-07-03T17:00:00Z", timeZone: "UTC" },
          },
          {
            subject: "Tentative meeting",
            isBusy: true,
            showAs: "tentative",
            start: { dateTime: "2026-07-04T14:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2026-07-04T15:00:00Z", timeZone: "UTC" },
          },
        ],
      });

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(
        "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer mock-access-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schedules: ["primary"],
            startTime: { dateTime: "2026-07-01T00:00:00Z", timeZone: "UTC" },
            endTime: { dateTime: "2026-07-07T00:00:00Z", timeZone: "UTC" },
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        value: Array<{
          scheduleId: string;
          availabilityView?: string;
          calendarEvents?: Array<{ subject?: string; showAs?: string }>;
        }>;
      };
      expect(body.value[0].calendarEvents![0].showAs).toBe("oof");
      expect(body.value[0].calendarEvents![1].showAs).toBe("tentative");
    });
  });

  describe("Slice 5: Personal vs work/school account identification", () => {
    it("for personal accounts, token exchange returns error that triggers unsupported_microsoft_account", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();
      adapter.setAccountKind("personal");

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
        method: "POST",
        body: new URLSearchParams({
          code: "auth-code-1",
          code_verifier: "verifier-1",
          grant_type: "authorization_code",
          redirect_uri:
            "https://slotmerge.example/me/calendar-connections/callback",
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        error: string;
        error_description: string;
      };
      expect(body.error).toBe("access_denied");
      expect(body.error_description).toContain("personal");
    });

    it("for work-school accounts, token exchange succeeds normally", async () => {
      const adapter = buildMockMicrosoftGraphAdapter({
        accessToken: "work-school-access",
        refreshToken: "work-school-refresh",
      });
      adapter.setAccountKind("work-school");

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
        method: "POST",
        body: new URLSearchParams({ code: "c", code_verifier: "v" }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { access_token: string };
      expect(body.access_token).toBe("work-school-access");
    });
  });

  describe("Slice 6: Webhook delivery recording", () => {
    it("records webhook deliveries with subscription and channel IDs", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();
      const notifier = adapter.getWebhookNotifier();

      await notifier(
        new Request("http://localhost/app/webhooks/microsoft/calendar", {
          method: "POST",
          headers: {
            "x-ms-subscription-id": "subscription-abc",
            "x-ms-channel-id": "channel-xyz",
          },
          body: JSON.stringify({
            subscriptionId: "subscription-abc",
            clientState: "connection-1",
          }),
        }),
      );

      expect(adapter.webhookDeliveries).toHaveLength(1);
      expect(adapter.webhookDeliveries[0].subscriptionId).toBe(
        "subscription-abc",
      );
      expect(adapter.webhookDeliveries[0].channelId).toBe("channel-xyz");
      expect(adapter.webhookDeliveries[0].clientState).toBe("connection-1");
    });

    it("records full webhook body", async () => {
      const adapter = buildMockMicrosoftGraphAdapter();
      const notifier = adapter.getWebhookNotifier();

      const webhookBody = {
        subscriptionId: "sub-1",
        clientState: "conn-1",
        value: [{ test: true }],
      };
      await notifier(
        new Request("http://localhost/", {
          method: "POST",
          headers: {
            "x-ms-subscription-id": "sub-1",
            "x-ms-channel-id": "ch-1",
          },
          body: JSON.stringify(webhookBody),
        }),
      );

      expect(adapter.webhookDeliveries[0].body).toEqual(webhookBody);
    });
  });

  describe("reset()", () => {
    it("clears all recorded calls and configured responses", async () => {
      const adapter = buildMockMicrosoftGraphAdapter({
        accessToken: "mock-access-token",
        primaryCalendarId: "primary-cal",
      });
      adapter.setAccountKind("personal");
      adapter.setScheduleResponse("primary", {
        availabilityView: "2",
        scheduleItems: [],
      });

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl(MICROSOFT_TOKEN_ENDPOINT, {
        method: "POST",
        body: new URLSearchParams({ code: "c", code_verifier: "v" }),
      });
      await fetchImpl(
        "https://graph.microsoft.com/v1.0/me/calendar/getSchedule",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schedules: ["primary"],
            startTime: { dateTime: "2026-07-01T00:00:00Z", timeZone: "UTC" },
            endTime: { dateTime: "2026-07-07T00:00:00Z", timeZone: "UTC" },
          }),
        },
      );
      const notifier = adapter.getWebhookNotifier();
      await notifier(
        new Request("http://localhost/", {
          method: "POST",
          headers: {
            "x-ms-subscription-id": "sub-1",
            "x-ms-channel-id": "ch-1",
          },
          body: JSON.stringify({ subscriptionId: "sub-1", clientState: "c1" }),
        }),
      );

      adapter.reset();

      expect(adapter.oauthCallbacks).toHaveLength(0);
      expect(adapter.getScheduleCalls).toHaveLength(0);
      expect(adapter.primaryCalendarCalls).toHaveLength(0);
      expect(adapter.webhookDeliveries).toHaveLength(0);
      expect(adapter.accountKind).toBe("work-school");
    });
  });
});
