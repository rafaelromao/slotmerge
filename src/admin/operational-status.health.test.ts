import { describe, expect, it, vi } from "vitest";

import {
  createAdminStatusWorkflow,
  deriveEmailFailureRate,
  deriveHealthFromInputs,
  deriveStatusTone,
  type EmailFailureRateInput,
  type HealthInputs,
  type StatusTone,
  type StatusToneConfig,
} from "./operational-status.workflow";

describe("deriveEmailFailureRate", () => {
  it("returns 0 when there are no terminal events", () => {
    const input: EmailFailureRateInput = { sent: 0, failed: 0 };
    expect(deriveEmailFailureRate(input)).toBe(0);
  });

  it("returns the failed / (sent + failed) ratio as a percentage", () => {
    expect(
      deriveEmailFailureRate({
        sent: 95,
        failed: 5,
      } satisfies EmailFailureRateInput),
    ).toBe(5);
    expect(
      deriveEmailFailureRate({
        sent: 90,
        failed: 10,
      } satisfies EmailFailureRateInput),
    ).toBe(10);
    expect(
      deriveEmailFailureRate({
        sent: 80,
        failed: 20,
      } satisfies EmailFailureRateInput),
    ).toBe(20);
  });

  it("returns 0 when every terminal event succeeded", () => {
    expect(deriveEmailFailureRate({ sent: 100, failed: 0 })).toBe(0);
  });

  it("returns 100 when every terminal event failed", () => {
    expect(deriveEmailFailureRate({ sent: 0, failed: 100 })).toBe(100);
  });

  it("excludes pending (queued/sending) from the ratio", () => {
    expect(
      deriveEmailFailureRate({
        queued: 50,
        sending: 50,
        sent: 95,
        failed: 5,
      }),
    ).toBe(5);
  });
});

describe("deriveStatusTone", () => {
  // Email: AC says "< 5% green, 5–10% amber, > 10% red". With greenMax=4.99
  // (inclusive upper bound of green), value=5 falls through to amber.
  const emailConfig: StatusToneConfig = { greenMax: 4.99, amberMax: 10 };
  const calendarConfig: StatusToneConfig = { greenMax: 0, amberMax: 1 };
  const tokensConfig: StatusToneConfig = { greenMax: 0, amberMax: 3 };

  it("Email: green at < 5%, amber at 5-10%, red at > 10%", () => {
    expect(deriveStatusTone(0, emailConfig)).toBe<StatusTone>("green");
    expect(deriveStatusTone(4.99, emailConfig)).toBe<StatusTone>("green");
    expect(deriveStatusTone(5, emailConfig)).toBe<StatusTone>("amber");
    expect(deriveStatusTone(9.99, emailConfig)).toBe<StatusTone>("amber");
    expect(deriveStatusTone(10, emailConfig)).toBe<StatusTone>("amber");
    expect(deriveStatusTone(10.01, emailConfig)).toBe<StatusTone>("red");
  });

  it("Calendar needs_reconnect: green at 0, amber at 1, red at > 1", () => {
    expect(deriveStatusTone(0, calendarConfig)).toBe<StatusTone>("green");
    expect(deriveStatusTone(1, calendarConfig)).toBe<StatusTone>("amber");
    expect(deriveStatusTone(2, calendarConfig)).toBe<StatusTone>("red");
  });

  it("Tokens: green at 0, amber at 1-3, red at > 3", () => {
    expect(deriveStatusTone(0, tokensConfig)).toBe<StatusTone>("green");
    expect(deriveStatusTone(1, tokensConfig)).toBe<StatusTone>("amber");
    expect(deriveStatusTone(3, tokensConfig)).toBe<StatusTone>("amber");
    expect(deriveStatusTone(4, tokensConfig)).toBe<StatusTone>("red");
  });
});

describe("deriveHealthFromInputs", () => {
  it("returns green across the board when everything is healthy", () => {
    const inputs: HealthInputs = {
      emailFailureRate: 0,
      needsReconnectCount: 0,
      tokensCount: 0,
    };
    expect(deriveHealthFromInputs(inputs)).toEqual({
      email: "green",
      calendar: "green",
      tokens: "green",
    });
  });

  it("returns amber for Email and amber for Calendar and green for Tokens when each is at the amber boundary", () => {
    const inputs: HealthInputs = {
      emailFailureRate: 5,
      needsReconnectCount: 1,
      tokensCount: 0,
    };
    expect(deriveHealthFromInputs(inputs)).toEqual({
      email: "amber",
      calendar: "amber",
      tokens: "green",
    });
  });

  it("returns red for Email and red for Calendar and red for Tokens when each crosses the red boundary", () => {
    const inputs: HealthInputs = {
      emailFailureRate: 11,
      needsReconnectCount: 2,
      tokensCount: 4,
    };
    expect(deriveHealthFromInputs(inputs)).toEqual({
      email: "red",
      calendar: "red",
      tokens: "red",
    });
  });
});

describe("createAdminStatusWorkflow.load", () => {
  it("returns the typed AdminStatusLoadResult with derived health", async () => {
    const workflow = createAdminStatusWorkflow({
      statusRepository: {
        summarizeEmailDelivery: vi.fn().mockResolvedValue({
          since: new Date("2026-07-11T12:00:00.000Z"),
          counts: { queued: 0, sending: 0, sent: 95, failed: 5 },
          recentFailures: [],
        }),
        summarizeCalendarConnections: vi.fn().mockResolvedValue({
          counts: {
            pending: 0,
            connected: 0,
            disconnected: 0,
            needsReconnect: 1,
          },
          byProvider: [],
          tokensNeedingRefresh: [],
        }),
      },
      clock: { now: () => new Date("2026-07-12T12:00:00.000Z") },
    });

    const result = await workflow.load();

    expect(result.generatedAt.toISOString()).toBe("2026-07-12T12:00:00.000Z");
    expect(result.windowHours).toBe(24);
    expect(result.emailFailureRate).toBe(5);
    expect(result.pendingEmailCount).toBe(0);
    expect(result.needsReconnectCount).toBe(1);
    expect(result.tokensCount).toBe(0);
    expect(result.health).toEqual({
      email: "amber",
      calendar: "amber",
      tokens: "green",
    });
  });
});
