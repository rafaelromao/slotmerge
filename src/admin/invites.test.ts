import { describe, expect, it, vi } from "vitest";

import { createAdminInvitesHandlers } from "./invites";
import { buildTestClock } from "../../tests/test-clock";
import type { Clock } from "../system/clock";

const testClock: Clock = buildTestClock(new Date("2026-07-12T00:00:00.000Z"));

describe("admin invites", () => {
  it("renders an invite form that defaults the role to User", async () => {
    const { GET } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([]),
        createInvite: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/invites"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('name="email"');
    expect(html).toContain('name="role"');
    expect(html).toContain('name="_csrf"');
    expect(html).toContain('value="csrf-token-1"');
    expect(html).toContain('<option value="user" selected>User</option>');
    expect(html).toContain('<option value="organizer">Organizer</option>');
    expect(html).toContain('<option value="admin">Admin</option>');
    expect(html).toContain("Invite users");
  });

  it("persists a pending invite with the inviting Admin and a default User role", async () => {
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      invite: {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      },
    });
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: {
        id: "email-event-1",
        recipient: "alice@example.com",
        type: "invite",
        payloadReference: "payload-ref-1",
        status: "queued",
        attempts: 0,
        createdAt: new Date("2026-07-12T00:00:00.000Z"),
        updatedAt: new Date("2026-07-12T00:00:00.000Z"),
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });

    const { POST } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([]),
        createInvite,
      },
      magicLinkTokenIssuer: {
        issueMagicLinkToken: vi.fn().mockReturnValue({
          token: "payload.signature",
          magicLinkUrl:
            "https://slotmerge.example.com/auth/magic-link/verify?token=payload.signature",
          expiresAt: new Date("2026-08-11T00:00:00.000Z"),
        }),
      },
      emailDeliveryService: { sendEmail },
    });

    const response = await POST(
      new Request("http://localhost/admin/invites", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          _csrf: "csrf-token-1",
          email: " Alice@Example.com ",
        }).toString(),
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/admin/invites",
    );
    expect(createInvite).toHaveBeenCalledWith({
      email: "alice@example.com",
      role: "user",
      invitedByAdminId: "admin-1",
      now: new Date("2026-07-12T00:00:00.000Z"),
    });
  });

  it("returns a duplicate error instead of silently creating a second invite", async () => {
    const createInvite = vi.fn().mockResolvedValue({
      ok: false,
      reason: "duplicate",
    });

    const { POST } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([
          {
            id: "invite-1",
            email: "alice@example.com",
            role: "user",
            status: "pending",
            invitedByAdminId: "admin-1",
            invitedByAdminEmail: "admin@example.com",
          },
        ]),
        createInvite,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/invites", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          _csrf: "csrf-token-1",
          email: "alice@example.com",
        }).toString(),
      }),
    );

    const html = await response.text();

    expect(response.status).toBe(409);
    expect(html).toContain("An invite already exists for that email.");
    expect(html).toContain("alice@example.com");
    expect(createInvite).toHaveBeenCalledTimes(1);
  });

  it("lists pending and accepted invites", async () => {
    const { GET } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([
          {
            id: "invite-1",
            email: "pending@example.com",
            role: "user",
            status: "pending",
            invitedByAdminId: "admin-1",
            invitedByAdminEmail: "admin@example.com",
          },
          {
            id: "invite-2",
            email: "accepted@example.com",
            role: "organizer",
            status: "accepted",
            invitedByAdminId: "admin-1",
            invitedByAdminEmail: "admin@example.com",
          },
        ]),
        createInvite: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/invites"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("pending@example.com");
    expect(html).toContain("accepted@example.com");
    expect(html).toContain("Pending");
    expect(html).toContain("Accepted");
  });

  it("rejects a missing or wrong CSRF token", async () => {
    const createInvite = vi.fn();

    const { POST } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([]),
        createInvite,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/invites", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ email: "alice@example.com" }).toString(),
      }),
    );

    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain("Invalid CSRF token.");
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("re-renders the form when the invite submission is malformed", async () => {
    const createInvite = vi.fn();

    const { POST } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([]),
        createInvite,
      },
    });

    const response = await POST(
      new Request("http://localhost/admin/invites", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          _csrf: "csrf-token-1",
          email: "not-an-email",
        }).toString(),
      }),
    );

    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("Enter a valid email address and choose a role.");
    expect(createInvite).not.toHaveBeenCalled();
  });

  it("dispatches an invitation email with a magic-link URL tied to the persisted invite", async () => {
    const sendEmail = vi.fn().mockResolvedValue({
      emailEvent: {
        id: "email-event-1",
        recipient: "alice@example.com",
        type: "invite",
        payloadReference: "payload-ref-1",
        status: "queued",
        attempts: 0,
        createdAt: new Date("2026-07-12T00:00:00.000Z"),
        updatedAt: new Date("2026-07-12T00:00:00.000Z"),
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    const createInvite = vi.fn().mockResolvedValue({
      ok: true,
      invite: {
        id: "invite-1",
        email: "alice@example.com",
        role: "user",
        status: "pending",
        invitedByAdminId: "admin-1",
        invitedByAdminEmail: "admin@example.com",
        expiresAt: new Date("2026-08-11T00:00:00.000Z"),
      },
    });

    const { POST } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([]),
        createInvite,
      },
      magicLinkTokenIssuer: {
        issueMagicLinkToken: vi.fn().mockReturnValue({
          token: "payload.signature",
          magicLinkUrl:
            "https://slotmerge.example.com/auth/magic-link/verify?token=payload.signature",
          expiresAt: new Date("2026-08-11T00:00:00.000Z"),
        }),
      },
      emailDeliveryService: { sendEmail },
    });

    const response = await POST(
      new Request("http://localhost/admin/invites", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          _csrf: "csrf-token-1",
          email: "alice@example.com",
        }).toString(),
      }),
    );

    expect(response.status).toBe(303);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const sent = sendEmail.mock.calls[0]?.[0] as {
      recipient: string;
      type: string;
      payload: Record<string, unknown>;
    };
    expect(sent.recipient).toBe("alice@example.com");
    expect(sent.type).toBe("invite");
    expect(sent.payload).toMatchObject({
      inviteId: "invite-1",
      email: "alice@example.com",
      role: "user",
    });
    expect(sent.payload.magicLinkUrl).toBe(
      "https://slotmerge.example.com/auth/magic-link/verify?token=payload.signature",
    );
  });

  it("renders '(deleted Admin)' when the inviter has been self-deleted", async () => {
    const { GET } = createAdminInvitesHandlers({
      clock: testClock,
      getSession: vi.fn().mockResolvedValue({
        user: {
          id: "admin-1",
          email: "admin@example.com",
          displayName: null,
          role: "admin",
          status: "active",
          profileTimezone: null,
          bufferMinutes: 0,
        },
        csrfToken: "csrf-token-1",
      }),
      inviteRepository: {
        listInvites: vi.fn().mockResolvedValue([
          {
            id: "invite-1",
            email: "orphan@example.com",
            role: "user",
            status: "pending",
            invitedByAdminId: null,
            invitedByAdminEmail: null,
          },
        ]),
        createInvite: vi.fn(),
      },
    });

    const response = await GET(new Request("http://localhost/admin/invites"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("orphan@example.com");
    expect(html).toContain("(deleted Admin)");
  });
});
