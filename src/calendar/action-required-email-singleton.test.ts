import { afterEach, describe, expect, it, vi } from "vitest";

import {
  setEmailDeliveryServiceForTests,
  getEmailDeliveryService,
  createCalendarActionRequiredEmailTrigger,
} from "./action-required-email-singleton";
import { setConnectionActionRequiredDispatchLookupForTests } from "./action-required-email.repository";

describe("calendar action-required email singleton", () => {
  afterEach(() => {
    setEmailDeliveryServiceForTests(null);
  });

  it("returns the registered test override", () => {
    const sendEmail = vi.fn();
    setEmailDeliveryServiceForTests({ sendEmail });

    const service = getEmailDeliveryService();

    expect(service).toBeDefined();
  });

  it("createCalendarActionRequiredEmailTrigger composes the singleton email delivery service with the dispatch lookup", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: { id: "event-trigger" },
    });
    setEmailDeliveryServiceForTests({ sendEmail });
    const findMostRecentConnectionDispatch = vi.fn().mockResolvedValue(null);
    setConnectionActionRequiredDispatchLookupForTests({
      findMostRecentConnectionDispatch,
    });

    const trigger = createCalendarActionRequiredEmailTrigger({
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
    });

    const result = await trigger({
      connection: {
        id: "connection-1",
        userId: "user-1",
        provider: "google",
        user: { email: "user@example.com", displayName: "Ada" },
        baseUrl: "https://slotmerge.example",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      reason: "token-revoked",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(findMostRecentConnectionDispatch).toHaveBeenCalledWith(
      "connection-1",
      "token-revoked",
      expect.any(Date),
    );
    expect(result).toEqual({
      status: "sent",
      emailEventId: "event-trigger",
      skipped: false,
    });
  });
});
