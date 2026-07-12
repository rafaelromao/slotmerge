import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSessionRepositoryForTests } from "../src/auth/session";
import {
  setGoogleCalendarConnectionRepositoryForTests,
  setMicrosoftCalendarConnectionRepositoryForTests,
} from "../src/calendar/repository";
import { setEmailDeliveryServiceForTests } from "../src/calendar/action-required-email-singleton";
import { setConnectionActionRequiredDispatchLookupForTests } from "../src/calendar/action-required-email.repository";

import {
  TOKEN_ENCRYPTION_KEY,
  USER,
  buildGoogleConnection,
  revoke,
} from "./calendar-action-required-email-wiring-fixtures";

describe("PATCH /me/calendar-connections/[id] - action-required email wiring", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY = TOKEN_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
    setSessionRepositoryForTests(null);
    setGoogleCalendarConnectionRepositoryForTests(null);
    setMicrosoftCalendarConnectionRepositoryForTests(null);
    setEmailDeliveryServiceForTests(null);
    setConnectionActionRequiredDispatchLookupForTests(null);
    vi.unstubAllGlobals();
  });

  it("returns 404 when the connection belongs to a different user (no email sent)", async () => {
    const stored = buildGoogleConnection({ userId: "user-other" });
    const sendEmail = vi.fn();
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    const response = await revoke(stored);
    expect(response.status).toBe(404);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("triggers a token-revoked action-required email after a successful revoke", async () => {
    const stored = buildGoogleConnection();
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-revoke" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    const response = await revoke(stored);
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const firstCall = sendEmail.mock.calls[0]?.[0] as {
      recipient: string;
      type: string;
      payload: Record<string, unknown>;
    };
    expect(firstCall).toMatchObject({
      recipient: USER.email,
      type: "calendar-action-required",
    });
    expect(firstCall.payload.reconnectUrl).toEqual(expect.stringContaining("/me/calendar-connections"));
  });

  it("still returns 200 to the user even when the action-required email enqueue fails", async () => {
    const stored = buildGoogleConnection();
    const sendEmail = vi
      .fn()
      .mockRejectedValue(new Error("queue unavailable"));
    setEmailDeliveryServiceForTests({ sendEmail });
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(null),
    });
    const response = await revoke(stored);
    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send an action-required email when the dedup window is still active", async () => {
    const stored = buildGoogleConnection();
    const sendEmail = vi.fn();
    setEmailDeliveryServiceForTests({ sendEmail });
    // Return a timestamp 5 minutes before the current wall clock to ensure it
    // falls inside the default 60-minute dedup window.
    const recentDispatch = new Date(Date.now() - 5 * 60 * 1000);
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch: vi.fn().mockResolvedValue(recentDispatch),
    });
    const response = await revoke(stored);
    expect(response.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});