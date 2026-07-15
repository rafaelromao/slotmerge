import { describe, expect, it } from "vitest";
import { buildMockGoogleCalendarAdapter } from "./google-calendar-adapter";

describe("MockGoogleCalendarAdapter", () => {
  describe("Slice 1: OAuth consent callback recording", () => {
    it("records OAuth token exchange calls", async () => {
      const adapter = buildMockGoogleCalendarAdapter();
      expect(adapter.oauthCallbacks).toHaveLength(0);

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "google-client-id",
          client_secret: "google-client-secret",
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
      const adapter = buildMockGoogleCalendarAdapter({
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresIn: 3600,
      });

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl("https://oauth2.googleapis.com/token", {
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
      expect(body.scope).toBe(
        "https://www.googleapis.com/auth/calendar.freebusy",
      );
    });
  });

  describe("Slice 2: OAuth scope recording", () => {
    it("records requested OAuth scopes", async () => {
      const adapter = buildMockGoogleCalendarAdapter();

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          code: "auth-code-1",
          code_verifier: "verifier-1",
          scope: "https://www.googleapis.com/auth/calendar.freebusy",
          state: "state-1",
        }),
      });

      expect(adapter.requestedScopes).toHaveLength(1);
      expect(adapter.requestedScopes[0]).toBe(
        "https://www.googleapis.com/auth/calendar.freebusy",
      );
    });
  });

  describe("Slice 3: Free/busy query recording", () => {
    it("records free/busy queries with time range and calendar IDs", async () => {
      const adapter = buildMockGoogleCalendarAdapter();

      const fetchImpl = adapter.getFetchImpl();
      const timeMin = "2026-07-01T00:00:00Z";
      const timeMax = "2026-07-07T00:00:00Z";
      await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: "primary" }, { id: "work@example.com" }],
        }),
      });

      expect(adapter.freeBusyQueries).toHaveLength(1);
      expect(adapter.freeBusyQueries[0].timeMin.getTime()).toBe(
        new Date(timeMin).getTime(),
      );
      expect(adapter.freeBusyQueries[0].timeMax.getTime()).toBe(
        new Date(timeMax).getTime(),
      );
      expect(adapter.freeBusyQueries[0].calendarIds).toEqual([
        "primary",
        "work@example.com",
      ]);
    });
  });

  describe("Slice 4: Scripted free/busy responses", () => {
    it("returns configured busy intervals in Google API format", async () => {
      const adapter = buildMockGoogleCalendarAdapter();
      const busyStart = new Date("2026-07-02T10:00:00Z");
      const busyEnd = new Date("2026-07-02T11:00:00Z");

      adapter.setFreeBusyResponse("primary", [
        { start: busyStart, end: busyEnd, status: "busy" },
      ]);

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            timeMin: "2026-07-01T00:00:00Z",
            timeMax: "2026-07-07T00:00:00Z",
            items: [{ id: "primary" }],
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        calendars: Record<
          string,
          { busy: Array<{ start: string; end: string }> }
        >;
      };
      expect(body.calendars["primary"].busy).toHaveLength(1);
      expect(body.calendars["primary"].busy[0].start).toBe(
        busyStart.toISOString(),
      );
      expect(body.calendars["primary"].busy[0].end).toBe(busyEnd.toISOString());
    });

    it("returns out-of-office and tentative intervals", async () => {
      const adapter = buildMockGoogleCalendarAdapter();
      const oooStart = new Date("2026-07-03T09:00:00Z");
      const oooEnd = new Date("2026-07-03T17:00:00Z");
      const tentativeStart = new Date("2026-07-04T14:00:00Z");
      const tentativeEnd = new Date("2026-07-04T15:00:00Z");

      adapter.setFreeBusyResponse("primary", [
        { start: oooStart, end: oooEnd, status: "out-of-office" },
        { start: tentativeStart, end: tentativeEnd, status: "tentative" },
      ]);

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          body: JSON.stringify({
            timeMin: "2026-07-01T00:00:00Z",
            timeMax: "2026-07-07T00:00:00Z",
            items: [{ id: "primary" }],
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        calendars: Record<
          string,
          {
            outOfOffice: Array<{ start: string; end: string }>;
            tentative: Array<{ start: string; end: string }>;
          }
        >;
      };
      expect(body.calendars["primary"].outOfOffice).toHaveLength(1);
      expect(body.calendars["primary"].outOfOffice[0].start).toBe(
        oooStart.toISOString(),
      );
      expect(body.calendars["primary"].tentative).toHaveLength(1);
      expect(body.calendars["primary"].tentative[0].start).toBe(
        tentativeStart.toISOString(),
      );
    });

    it("maps free and working-elsewhere to appropriate slots", async () => {
      const adapter = buildMockGoogleCalendarAdapter();
      const freeStart = new Date("2026-07-02T08:00:00Z");
      const freeEnd = new Date("2026-07-02T09:00:00Z");
      const elsewhereStart = new Date("2026-07-02T15:00:00Z");
      const elsewhereEnd = new Date("2026-07-02T16:00:00Z");

      adapter.setFreeBusyResponse("primary", [
        { start: freeStart, end: freeEnd, status: "free" },
        {
          start: elsewhereStart,
          end: elsewhereEnd,
          status: "working-elsewhere",
        },
      ]);

      const fetchImpl = adapter.getFetchImpl();
      const response = await fetchImpl(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          body: JSON.stringify({
            timeMin: "2026-07-01T00:00:00Z",
            timeMax: "2026-07-07T00:00:00Z",
            items: [{ id: "primary" }],
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        calendars: Record<string, { busy: unknown[]; tentative: unknown[] }>;
      };
      expect(body.calendars["primary"].busy).toHaveLength(0);
      expect(body.calendars["primary"].tentative).toHaveLength(1);
    });
  });

  describe("Slice 5: Webhook delivery recording", () => {
    it("records webhook deliveries", async () => {
      const adapter = buildMockGoogleCalendarAdapter();
      const notifier = adapter.getWebhookNotifier();

      await notifier(
        new Request("http://localhost/calendar/webhook", {
          method: "POST",
          headers: {
            "x-goog-channel-id": "channel-abc",
            "x-goog-resource-id": "resource-xyz",
            "x-goog-resource-state": "exists",
          },
        }),
      );

      expect(adapter.webhookDeliveries).toHaveLength(1);
      expect(adapter.webhookDeliveries[0].channelId).toBe("channel-abc");
      expect(adapter.webhookDeliveries[0].resourceId).toBe("resource-xyz");
      expect(adapter.webhookDeliveries[0].resourceState).toBe("exists");
    });
  });

  describe("Slice 6: Denied OAuth consent recording", () => {
    it("builds and records a denied consent callback", async () => {
      const adapter = buildMockGoogleCalendarAdapter();
      const state = "sealed-google-state";

      const request = adapter.buildDeniedConsentCallbackRequest({
        baseUrl: "https://slotmerge.example",
        errorDescription: "The user denied access.",
        state,
      });

      expect(request.method).toBe("POST");
      expect(request.url).toBe(
        "https://slotmerge.example/me/calendar-connections/callback",
      );
      const body = await request.formData();
      expect(body.get("error")).toBe("access_denied");
      expect(body.get("error_description")).toBe("The user denied access.");
      expect(body.get("state")).toBe(state);
      expect(adapter.denialCallbacks).toEqual([
        {
          error: "access_denied",
          errorDescription: "The user denied access.",
          state,
        },
      ]);
      expect(adapter.oauthCallbacks).toHaveLength(0);
      expect(adapter.freeBusyQueries).toHaveLength(0);
      expect(adapter.webhookDeliveries).toHaveLength(0);

      adapter.reset();

      expect(adapter.denialCallbacks).toHaveLength(0);
    });
  });

  describe("reset()", () => {
    it("clears all recorded calls and responses", async () => {
      const adapter = buildMockGoogleCalendarAdapter();

      const fetchImpl = adapter.getFetchImpl();
      await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          code: "c",
          code_verifier: "v",
          scope: "s",
        }),
      });
      await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        body: JSON.stringify({
          timeMin: "2026-07-01T00:00:00Z",
          timeMax: "2026-07-07T00:00:00Z",
          items: [{ id: "primary" }],
        }),
      });
      const notifier = adapter.getWebhookNotifier();
      await notifier(new Request("http://localhost/", { method: "POST" }));
      adapter.buildDeniedConsentCallbackRequest({
        baseUrl: "http://localhost",
        state: "state",
      });

      adapter.reset();

      expect(adapter.oauthCallbacks).toHaveLength(0);
      expect(adapter.denialCallbacks).toHaveLength(0);
      expect(adapter.freeBusyQueries).toHaveLength(0);
      expect(adapter.webhookDeliveries).toHaveLength(0);
      expect(adapter.requestedScopes).toHaveLength(0);
    });
  });
});
