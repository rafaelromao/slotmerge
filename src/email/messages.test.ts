import { describe, expect, it } from "vitest";

import {
  sendAdminCriticalEmail,
  sendCalendarActionRequiredEmail,
  sendInviteEmail,
  sendMagicLinkEmail,
} from "./messages";

describe("email message helpers", () => {
  it("routes every product email type through one delivery service", async () => {
    const calls: Array<{ type: string; recipient: string }> = [];
    const service = {
      sendEmail: (input: { recipient: string; type: string }) => {
        calls.push({ type: input.type, recipient: input.recipient });
        return Promise.resolve({ emailEvent: { id: "email-event-1" } });
      },
    };

    await Promise.all([
      sendInviteEmail(service, {
        recipient: "invitee@example.com",
        payload: { inviteId: "invite-1" },
      }),
      sendMagicLinkEmail(service, {
        recipient: "login@example.com",
        payload: { token: "magic-link-token" },
      }),
      sendCalendarActionRequiredEmail(service, {
        recipient: "user@example.com",
        payload: { connectionId: "connection-1" },
      }),
      sendAdminCriticalEmail(service, {
        recipient: "admin@example.com",
        payload: { incidentId: "incident-1" },
      }),
    ]);

    expect(calls).toEqual([
      { type: "invite", recipient: "invitee@example.com" },
      { type: "magic-link", recipient: "login@example.com" },
      { type: "calendar-action-required", recipient: "user@example.com" },
      { type: "admin-critical", recipient: "admin@example.com" },
    ]);
  });
});
